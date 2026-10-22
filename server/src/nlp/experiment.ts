import type { Category } from '../domain.js';
import { articleBody, DISTRACTORS, materialiseRecords, scenarios } from '../data/scenarios.js';
import { accuracy, macroF1, mean, round } from './metrics.js';
import { anonymize, ModelBundle } from './models.js';
import { topTerms } from './text.js';
import {
  extractiveRecommendation,
  monolithicRecommendation,
  rankByKeywords,
  rankByVector,
  type CorpusDoc,
  usefulnessScore,
} from './retrieval.js';

export type ExperimentReport = {
  sampleSize: { train: number; validation: number; test: number };
  classification: {
    agent: { macroF1: number; priorityAccuracy: number; latencyMs: number };
    machineLearning: { macroF1: number; priorityAccuracy: number; latencyMs: number };
    monolithic: { macroF1: number; priorityAccuracy: number; latencyMs: number };
    perCategory: { category: string; precision: number; recall: number; f1: number }[];
  };
  retrieval: {
    ragHitAt5: number;
    staticHitAt5: number;
    ragLatencyMs: number;
    staticLatencyMs: number;
  };
  recommendation: {
    ragUsefulness: number;
    staticUsefulness: number;
    monolithicUsefulness: number;
  };
  learning: {
    hitAt5Before: number;
    hitAt5After: number;
    usefulnessBefore: number;
    usefulnessAfter: number;
    latencyBeforeMs: number;
    latencyAfterMs: number;
    heldOutQueries: number;
    recordsAdded: number;
  };
  efficiency: {
    classificationLatencyMs: number;
    endToEndMs: number;
  };
};

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

function perCategory(actual: string[], predicted: string[]): ExperimentReport['classification']['perCategory'] {
  const labels = [...new Set(actual)];
  return labels.map((label) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < actual.length; i += 1) {
      const truth = actual[i] === label;
      const guess = predicted[i] === label;
      if (truth && guess) tp += 1;
      else if (guess) fp += 1;
      else if (truth) fn += 1;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { category: label, precision: round(precision), recall: round(recall), f1: round(f1) };
  });
}

export function buildCorpus(bundle: ModelBundle, includeHeldOut: boolean, learned: CorpusDoc[] = []): CorpusDoc[] {
  const docs: CorpusDoc[] = [];
  for (const scenario of scenarios) {
    if (!includeHeldOut && scenario.heldOut) continue;
    const body = articleBody(scenario);
    docs.push({
      id: scenario.key,
      title: scenario.articleTitle,
      body,
      category: scenario.category,
      system: scenario.system,
      sourceType: 'APPROVED_ARTICLE',
      scenarioKey: scenario.key,
      embedding: bundle.vectorizer.transform(`${scenario.articleTitle}\n${body}`),
    });
  }
  for (const distractor of DISTRACTORS) {
    docs.push({
      id: `distractor-${docs.length}`,
      title: distractor.title,
      body: distractor.body,
      category: distractor.category,
      system: distractor.system,
      sourceType: 'APPROVED_ARTICLE',
      scenarioKey: null,
      embedding: bundle.vectorizer.transform(`${distractor.title}\n${distractor.body}`),
    });
  }
  return [...docs, ...learned];
}

export function createTrainedBundle(): ModelBundle {
  const records = materialiseRecords().filter((record) => record.split === 'TRAIN');
  const bundle = new ModelBundle();
  bundle.train(
    records.map((record) => ({
      text: `${record.title}\n${record.description}`,
      category: record.category,
      urgency: record.urgency,
      priority: record.priority,
    })),
    scenarios.map((scenario) => `${scenario.articleTitle}\n${articleBody(scenario)}`),
  );
  return bundle;
}

export function runExperiment(): ExperimentReport {
  const records = materialiseRecords();
  const train = records.filter((record) => record.split === 'TRAIN');
  const test = records.filter((record) => record.split === 'TEST');
  const validation = records.filter((record) => record.split === 'VAL');
  const bundle = createTrainedBundle();
  const actualCategory: string[] = [];
  const actualPriority: string[] = [];
  const agentCategory: string[] = [];
  const agentPriority: string[] = [];
  const mlCategory: string[] = [];
  const mlPriority: string[] = [];
  const monoCategory: string[] = [];
  const monoPriority: string[] = [];
  let agentMs = 0;
  let mlMs = 0;
  let monoMs = 0;
  let endToEnd = 0;
  const corpus = buildCorpus(bundle, true);
  const ragHits: number[] = [];
  const staticHits: number[] = [];
  const ragUse: number[] = [];
  const staticUse: number[] = [];
  const monoUse: number[] = [];
  let ragMs = 0;
  let staticMs = 0;

  for (const record of test) {
    const agent = timed(() => bundle.classificationAgent(record.title, record.description, record.affectedSystem));
    const ml = timed(() => bundle.machineLearningBaseline(record.title, record.description));
    const mono = timed(() => bundle.monolithicBaseline(record.title, record.description));
    agentMs += agent.ms;
    mlMs += ml.ms;
    monoMs += mono.ms;
    actualCategory.push(record.category);
    actualPriority.push(record.priority);
    agentCategory.push(agent.value.category);
    agentPriority.push(agent.value.priority);
    mlCategory.push(ml.value.category);
    mlPriority.push(ml.value.priority);
    monoCategory.push(mono.value.category);
    monoPriority.push(mono.value.priority);

    const started = performance.now();
    const queryText = `${record.title}\n${record.description}\nCategory: ${agent.value.category}. System: ${record.affectedSystem}.`;
    const rag = timed(() => rankByVector(corpus, bundle.vectorizer.transform(queryText), 5));
    const stat = timed(() => rankByKeywords(corpus, `${record.title}\n${record.description}`, 5));
    ragMs += rag.ms;
    staticMs += stat.ms;
    ragHits.push(rag.value.some((hit) => hit.scenarioKey === record.scenarioKey) ? 1 : 0);
    staticHits.push(stat.value.some((hit) => hit.scenarioKey === record.scenarioKey) ? 1 : 0);
    const ragRec = extractiveRecommendation(rag.value);
    const staticRec = extractiveRecommendation(stat.value);
    const monoRec = monolithicRecommendation(mono.value.category as Category);
    ragUse.push(usefulnessScore(ragRec.steps, record.goldResolution, rag.value.map((hit) => hit.scenarioKey), record.scenarioKey, ragRec.grounded));
    staticUse.push(usefulnessScore(staticRec.steps, record.goldResolution, stat.value.map((hit) => hit.scenarioKey), record.scenarioKey, staticRec.grounded));
    monoUse.push(usefulnessScore(monoRec.steps, record.goldResolution, [], record.scenarioKey, false));
    endToEnd += performance.now() - started + agent.ms;
  }

  const beforeCorpus = buildCorpus(bundle, false);
  const heldOut = test.filter((record) => scenarios.find((scenario) => scenario.key === record.scenarioKey)?.heldOut);
  const beforeHit: number[] = [];
  const beforeUse: number[] = [];
  let beforeMs = 0;
  for (const record of heldOut) {
    const agent = bundle.classificationAgent(record.title, record.description, record.affectedSystem);
    const queryText = `${record.title}\n${record.description}\nCategory: ${agent.category}. System: ${record.affectedSystem}.`;
    const ranked = timed(() => rankByVector(beforeCorpus, bundle.vectorizer.transform(queryText), 5));
    beforeMs += ranked.ms;
    beforeHit.push(ranked.value.some((hit) => hit.scenarioKey === record.scenarioKey) ? 1 : 0);
    const draft = extractiveRecommendation(ranked.value);
    beforeUse.push(usefulnessScore(draft.steps, record.goldResolution, ranked.value.map((hit) => hit.scenarioKey), record.scenarioKey, draft.grounded));
  }

  const learned: CorpusDoc[] = [];
  const seen = new Set<string>();
  for (const record of train) {
    const scenario = scenarios.find((item) => item.key === record.scenarioKey && item.heldOut);
    if (!scenario || seen.has(scenario.key)) continue;
    seen.add(scenario.key);
    const body = [
      `Learned from a resolved ${scenario.category} ticket. System: ${scenario.system}.`,
      `1. ${anonymize(scenario.resolution)}`,
      '2. The technician confirmed the outcome before the pattern was stored. Model weights were not changed.',
    ].join('\n');
    learned.push({
      id: `learned-${scenario.key}`,
      title: `Learned pattern: ${scenario.articleTitle}`,
      body,
      category: scenario.category,
      system: scenario.system,
      sourceType: 'LEARNED_PATTERN',
      scenarioKey: scenario.key,
      embedding: bundle.vectorizer.transform(`${scenario.articleTitle}\n${body}`),
    });
  }
  const afterCorpus = [...beforeCorpus, ...learned];
  const afterHit: number[] = [];
  const afterUse: number[] = [];
  let afterMs = 0;
  for (const record of heldOut) {
    const agent = bundle.classificationAgent(record.title, record.description, record.affectedSystem);
    const queryText = `${record.title}\n${record.description}\nCategory: ${agent.category}. System: ${record.affectedSystem}.`;
    const ranked = timed(() => rankByVector(afterCorpus, bundle.vectorizer.transform(queryText), 5));
    afterMs += ranked.ms;
    afterHit.push(ranked.value.some((hit) => hit.scenarioKey === record.scenarioKey) ? 1 : 0);
    const draft = extractiveRecommendation(ranked.value);
    afterUse.push(usefulnessScore(draft.steps, record.goldResolution, ranked.value.map((hit) => hit.scenarioKey), record.scenarioKey, draft.grounded));
  }

  const n = test.length || 1;
  return {
    sampleSize: { train: train.length, validation: validation.length, test: test.length },
    classification: {
      agent: {
        macroF1: round(macroF1(actualCategory, agentCategory)),
        priorityAccuracy: round(accuracy(actualPriority, agentPriority)),
        latencyMs: round(agentMs / n, 2),
      },
      machineLearning: {
        macroF1: round(macroF1(actualCategory, mlCategory)),
        priorityAccuracy: round(accuracy(actualPriority, mlPriority)),
        latencyMs: round(mlMs / n, 2),
      },
      monolithic: {
        macroF1: round(macroF1(actualCategory, monoCategory)),
        priorityAccuracy: round(accuracy(actualPriority, monoPriority)),
        latencyMs: round(monoMs / n, 2),
      },
      perCategory: perCategory(actualCategory, agentCategory),
    },
    retrieval: {
      ragHitAt5: round(mean(ragHits)),
      staticHitAt5: round(mean(staticHits)),
      ragLatencyMs: round(ragMs / n, 2),
      staticLatencyMs: round(staticMs / n, 2),
    },
    recommendation: {
      ragUsefulness: round(mean(ragUse)),
      staticUsefulness: round(mean(staticUse)),
      monolithicUsefulness: round(mean(monoUse)),
    },
    learning: {
      hitAt5Before: round(mean(beforeHit)),
      hitAt5After: round(mean(afterHit)),
      usefulnessBefore: round(mean(beforeUse)),
      usefulnessAfter: round(mean(afterUse)),
      latencyBeforeMs: round(beforeMs / Math.max(heldOut.length, 1), 2),
      latencyAfterMs: round(afterMs / Math.max(heldOut.length, 1), 2),
      heldOutQueries: heldOut.length,
      recordsAdded: learned.length,
    },
    efficiency: {
      classificationLatencyMs: round(agentMs / n, 2),
      endToEndMs: round(endToEnd / n, 2),
    },
  };
}

export function hypothesisVerdict(report: ExperimentReport): { id: string; statement: string; supported: boolean; note: string }[] {
  const h1 =
    report.classification.agent.macroF1 >= report.classification.machineLearning.macroF1 &&
    report.classification.agent.macroF1 >= report.classification.monolithic.macroF1 &&
    report.classification.agent.priorityAccuracy >= report.classification.machineLearning.priorityAccuracy &&
    report.classification.agent.priorityAccuracy >= report.classification.monolithic.priorityAccuracy;
  const h2 =
    report.retrieval.ragHitAt5 >= report.retrieval.staticHitAt5 &&
    report.recommendation.ragUsefulness >= report.recommendation.staticUsefulness;
  const h3 =
    report.learning.hitAt5After >= report.learning.hitAt5Before &&
    report.learning.usefulnessAfter >= report.learning.usefulnessBefore;
  return [
    {
      id: 'H1',
      statement:
        'The classification agent reaches category macro-F1 and priority accuracy at least as high as naive Bayes and a monolithic keyword prompt.',
      supported: h1,
      note: `Agent macro-F1 ${report.classification.agent.macroF1}, naive Bayes ${report.classification.machineLearning.macroF1}, monolithic ${report.classification.monolithic.macroF1}.`,
    },
    {
      id: 'H2',
      statement:
        'Retrieval-augmented recommendation places the relevant article in the top 5 at least as often as static keyword search, with equal or higher usefulness.',
      supported: h2,
      note: `Hit@5 RAG ${report.retrieval.ragHitAt5} versus static ${report.retrieval.staticHitAt5}. Usefulness ${report.recommendation.ragUsefulness} versus ${report.recommendation.staticUsefulness}.`,
    },
    {
      id: 'H3',
      statement:
        'Adding anonymised resolutions to the knowledge base improves later retrieval and usefulness without changing model weights.',
      supported: h3,
      note: `Held-out Hit@5 moved from ${report.learning.hitAt5Before} to ${report.learning.hitAt5After} after ${report.learning.recordsAdded} learned records.`,
    },
  ];
}

export function learnedPatternTerms(category: string, resolution: string): string[] {
  return [category.toLowerCase(), ...topTerms(resolution, 4)];
}
