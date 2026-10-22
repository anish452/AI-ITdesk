import type { Category, ClassifiedTicket, Priority, Urgency } from '../domain.js';
import { CATEGORIES, PRIORITIES, PRIORITY_FOR_URGENCY, URGENCIES, urgencyRank } from '../domain.js';
import { cosine, meanVector, tokenize, TfidfVectorizer } from './text.js';

type Example = { text: string; category: Category; urgency: Urgency; priority: Priority };

const GENERIC = new Set([
  'computer', 'working', 'help', 'issue', 'problem', 'broken', 'things', 'stuff', 'floor', 'need', 'look',
]);

const UPWARD_RULES: { pattern: RegExp; urgency: Urgency; reason: string }[] = [
  {
    pattern: /line (is )?down|production stopped|station offline|heartbeat lost|scanners are offline|warehouse wifi is down|shipping is blocked|payroll phishing|phishing page|unexpected country|impossible travel|credential/,
    urgency: 'CRITICAL',
    reason: 'Organisational rule: production stop or active account compromise is critical.',
  },
  {
    pattern: /goods receipt|movement type 101|unit_mismatch|wrong recipe|vpn|flapping|blue screen|will not pair|mfa loop|number match/,
    urgency: 'HIGH',
    reason: 'Organisational rule: a blocked business transaction or a single failed shop-floor device is high.',
  },
];

export class CentroidModel {
  centroids = new Map<string, number[]>();

  train(items: { text: string; label: string }[], vectorizer: TfidfVectorizer): void {
    const groups = new Map<string, number[][]>();
    for (const item of items) {
      const vector = vectorizer.transform(item.text);
      const list = groups.get(item.label) ?? [];
      list.push(vector);
      groups.set(item.label, list);
    }
    this.centroids = new Map([...groups.entries()].map(([label, vectors]) => [label, meanVector(vectors)]));
  }

  predict(text: string, vectorizer: TfidfVectorizer): { label: string; confidence: number; scores: Record<string, number> } {
    const vector = vectorizer.transform(text);
    const scores: Record<string, number> = {};
    for (const [label, centroid] of this.centroids) scores[label] = cosine(vector, centroid);
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = ranked[0] ?? ['ERP', 0];
    const second = ranked[1]?.[1] ?? 0;
    const margin = Math.max(0, top[1] - second);
    let confidence = Math.max(0, Math.min(1, top[1] * 0.65 + margin * 1.4));
    const content = tokenize(text).filter((token) => !GENERIC.has(token));
    if (content.length < 4) confidence = Math.min(confidence, 0.28);
    if (top[1] < 0.08) confidence = Math.min(confidence, 0.3);
    return { label: top[0], confidence, scores };
  }
}

export class NaiveBayesModel {
  private labels: string[] = [];
  private logPrior = new Map<string, number>();
  private tokenLog = new Map<string, Map<string, number>>();
  private unknownLog = new Map<string, number>();

  train(items: { tokens: string[]; label: string }[]): void {
    const labelCounts = new Map<string, number>();
    const tokenCounts = new Map<string, Map<string, number>>();
    const vocab = new Set<string>();
    for (const item of items) {
      labelCounts.set(item.label, (labelCounts.get(item.label) ?? 0) + 1);
      const bag = tokenCounts.get(item.label) ?? new Map<string, number>();
      for (const token of item.tokens) {
        vocab.add(token);
        bag.set(token, (bag.get(token) ?? 0) + 1);
      }
      tokenCounts.set(item.label, bag);
    }
    const total = items.length || 1;
    this.labels = [...labelCounts.keys()];
    const vocabSize = vocab.size || 1;
    for (const [label, count] of labelCounts) {
      this.logPrior.set(label, Math.log(count / total));
      const bag = tokenCounts.get(label) ?? new Map();
      const tokenTotal = [...bag.values()].reduce((sum, value) => sum + value, 0);
      const denom = tokenTotal + vocabSize;
      const logs = new Map<string, number>();
      for (const [token, tokenCount] of bag) logs.set(token, Math.log((tokenCount + 1) / denom));
      this.tokenLog.set(label, logs);
      this.unknownLog.set(label, Math.log(1 / denom));
    }
  }

  predict(text: string): { label: string; confidence: number; scores: Record<string, number> } {
    const tokens = tokenize(text);
    const scores: Record<string, number> = {};
    for (const label of this.labels) {
      let score = this.logPrior.get(label) ?? 0;
      const logs = this.tokenLog.get(label);
      const unknown = this.unknownLog.get(label) ?? -10;
      for (const token of tokens) score += logs?.get(token) ?? unknown;
      scores[label] = score;
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = ranked[0]?.[0] ?? this.labels[0] ?? 'ERP';
    const max = ranked[0]?.[1] ?? 0;
    const exp = ranked.map(([, score]) => Math.exp(score - max));
    const sum = exp.reduce((total, value) => total + value, 0) || 1;
    return { label: top, confidence: exp[0] / sum, scores };
  }
}

const LEXICON: Record<Category, string[]> = {
  ERP: ['sap', 'purchase', 'invoice', 'migo'],
  MES: ['linesight', 'recipe', 'oee', 'station'],
  IDENTITY_ACCESS: ['password', 'mfa', 'joiner', 'authorisation'],
  NETWORK: ['wifi', 'vpn', 'vlan', 'ssid'],
  HARDWARE: ['scanner', 'printer', 'terminal', 'display'],
  SOFTWARE: ['outlook', 'excel', 'teams', 'viewer'],
  CYBERSECURITY: ['phishing', 'usb', 'country', 'drawing'],
};

export class ModelBundle {
  vectorizer = new TfidfVectorizer();
  categoryCentroids = new CentroidModel();
  urgencyCentroids = new CentroidModel();
  categoryBayes = new NaiveBayesModel();
  urgencyBayes = new NaiveBayesModel();
  priorityBayes = new NaiveBayesModel();
  trained = false;

  train(examples: Example[], vocabularyDocuments: string[] = []): void {
    const texts = examples.map((example) => example.text);
    this.vectorizer.fit([...texts, ...vocabularyDocuments]);
    this.categoryCentroids.train(
      examples.map((example) => ({ text: example.text, label: example.category })),
      this.vectorizer,
    );
    this.urgencyCentroids.train(
      examples.map((example) => ({ text: example.text, label: example.urgency })),
      this.vectorizer,
    );
    const tokenised = examples.map((example) => ({ tokens: tokenize(example.text), ...example }));
    this.categoryBayes.train(tokenised.map((example) => ({ tokens: example.tokens, label: example.category })));
    this.urgencyBayes.train(tokenised.map((example) => ({ tokens: example.tokens, label: example.urgency })));
    this.priorityBayes.train(tokenised.map((example) => ({ tokens: example.tokens, label: example.priority })));
    this.trained = true;
  }

  classificationAgent(title: string, description: string, affectedSystem = ''): ClassifiedTicket {
    const text = `${title}\n${description}\n${affectedSystem}`;
    const categoryPrediction = this.categoryCentroids.predict(text, this.vectorizer);
    const urgencyPrediction = this.urgencyCentroids.predict(text, this.vectorizer);
    let urgency = urgencyPrediction.label as Urgency;
    const reasons = [
      `Category centroid selected ${categoryPrediction.label} with similarity margin encoded in confidence ${categoryPrediction.confidence.toFixed(2)}.`,
      `Urgency centroid selected ${urgency}.`,
    ];
    for (const rule of UPWARD_RULES) {
      if (rule.pattern.test(text.toLowerCase()) && urgencyRank(rule.urgency) > urgencyRank(urgency)) {
        urgency = rule.urgency;
        reasons.push(rule.reason);
      }
    }
    if (categoryPrediction.label === 'CYBERSECURITY' && urgencyRank(urgency) < urgencyRank('HIGH')) {
      urgency = 'HIGH';
      reasons.push('Organisational rule: cybersecurity requests are at least high priority.');
    }
    const category = (CATEGORIES.includes(categoryPrediction.label as Category)
      ? categoryPrediction.label
      : 'SOFTWARE') as Category;
    const priority = PRIORITY_FOR_URGENCY[urgency];
    reasons.push(`Priority ${priority} is derived from urgency ${urgency} by the service-desk matrix.`);
    return {
      category,
      urgency,
      priority,
      confidence: Number(categoryPrediction.confidence.toFixed(4)),
      rationale: reasons.join(' '),
      method: 'classification-agent',
    };
  }

  machineLearningBaseline(title: string, description: string): ClassifiedTicket {
    const text = `${title}\n${description}`;
    const category = this.categoryBayes.predict(text);
    const urgency = this.urgencyBayes.predict(text);
    const priority = this.priorityBayes.predict(text);
    return {
      category: category.label as Category,
      urgency: (URGENCIES.includes(urgency.label as Urgency) ? urgency.label : 'MEDIUM') as Urgency,
      priority: (PRIORITIES.includes(priority.label as Priority) ? priority.label : 'P3') as Priority,
      confidence: Number(category.confidence.toFixed(4)),
      rationale: 'Multinomial naive Bayes trained on ticket tokens, with independent category, urgency, and priority models.',
      method: 'ml-naive-bayes',
    };
  }

  monolithicBaseline(title: string, description: string): ClassifiedTicket {
    const tokens = new Set(tokenize(`${title}\n${description}`));
    const scores = CATEGORIES.map((category) => ({
      category,
      score: LEXICON[category].filter((word) => tokens.has(word)).length,
    })).sort((a, b) => b.score - a.score);
    const best = scores[0];
    const second = scores[1]?.score ?? 0;
    const category = best && best.score > 0 ? best.category : 'SOFTWARE';
    let urgency: Urgency = 'MEDIUM';
    const joined = `${title} ${description}`.toLowerCase();
    if (/phishing|unexpected country|line is down|production stopped/.test(joined)) urgency = 'CRITICAL';
    else if (/password|slow|blank|guest/.test(joined)) urgency = 'LOW';
    const confidence = best && best.score > 0 ? Math.min(0.9, 0.35 + (best.score - second) * 0.2) : 0.2;
    return {
      category,
      urgency,
      priority: PRIORITY_FOR_URGENCY[urgency],
      confidence: Number(confidence.toFixed(4)),
      rationale: 'Monolithic prompt simulation: one small keyword lexicon decides category and urgency together, without a specialist model or retrieval.',
      method: 'monolithic-prompt',
    };
  }
}

export function anonymize(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]')
    .replace(/\b(?:employee|user)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g, '[person]');
}

export function extractSteps(body: string): string[] {
  const numbered = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, ''));
  return numbered.slice(0, 5);
}

export function genericSteps(category: string): { problem: string; steps: string[] } {
  const advice: Record<string, string[]> = {
    ERP: ['Ask the user to reopen the application.', 'Repeat the last transaction.', 'Pass the ticket to the enterprise applications queue if it continues.'],
    MES: ['Ask the operator to reopen the manufacturing system.', 'Confirm the station name.', 'Pass the ticket to the manufacturing applications queue.'],
    IDENTITY_ACCESS: ['Ask the user to try the sign-in again.', 'Check that the account exists.', 'Pass the ticket to the identity queue.'],
    NETWORK: ['Ask the user to reconnect.', 'Note the site name.', 'Pass the ticket to the network queue.'],
    HARDWARE: ['Ask the user to reboot the device.', 'Note the asset location.', 'Pass the ticket to the hardware queue.'],
    SOFTWARE: ['Ask the user to reopen the program.', 'Note the application name.', 'Pass the ticket to the software queue.'],
    CYBERSECURITY: ['Ask the user not to click further links.', 'Note the time of the message.', 'Pass the ticket to the security queue.'],
  };
  return {
    problem: `A generic ${category} issue was guessed without consulting the knowledge base.`,
    steps: advice[category] ?? advice.SOFTWARE,
  };
}
