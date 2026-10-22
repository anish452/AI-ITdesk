import type { Category, ResolutionDraft, RetrievedHit } from '../domain.js';
import { cosine } from './text.js';
import { genericSteps } from './models.js';

export type CorpusDoc = {
  id: string;
  title: string;
  body: string;
  category: string;
  system: string;
  sourceType: string;
  scenarioKey: string | null;
  embedding: number[];
};

export function toPgVector(vector: number[]): string {
  return `[${vector.map((value) => value.toFixed(6)).join(',')}]`;
}

export function rankByVector(docs: CorpusDoc[], query: number[], limit: number): RetrievedHit[] {
  return docs
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      body: doc.body,
      category: doc.category,
      system: doc.system,
      sourceType: doc.sourceType,
      scenarioKey: doc.scenarioKey,
      score: cosine(query, doc.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function rankByKeywords(docs: CorpusDoc[], query: string, limit: number): RetrievedHit[] {
  const tokens = new Set(query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token.length > 2));
  return docs
    .map((doc) => {
      const haystack = `${doc.title} ${doc.body}`.toLowerCase();
      let score = 0;
      for (const token of tokens) if (haystack.includes(token)) score += 1;
      return {
        id: doc.id,
        title: doc.title,
        body: doc.body,
        category: doc.category,
        system: doc.system,
        sourceType: doc.sourceType,
        scenarioKey: doc.scenarioKey,
        score,
      };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function stepsFrom(body: string): string[] {
  const numbered = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, ''))
    .slice(0, 5);
  if (numbered.length > 0) return numbered;
  return body
    .split(/[.\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 40)
    .slice(0, 3);
}

export function extractiveRecommendation(hits: RetrievedHit[]): ResolutionDraft {
  if (hits.length === 0) {
    return {
      problem: 'No approved knowledge was retrieved for this request.',
      steps: [],
      references: [],
      confidence: 0,
      warning: 'Evidence is absent. The technician should investigate without relying on a generated recommendation.',
      grounded: false,
      generator: 'extractive',
    };
  }
  const steps = stepsFrom(hits[0].body);
  if (steps.length < 3) {
    for (const step of stepsFrom(hits[1]?.body ?? '')) {
      if (!steps.includes(step)) steps.push(step);
      if (steps.length >= 5) break;
    }
  }
  const categories = new Set(hits.slice(0, 3).map((hit) => hit.category));
  const mean = hits.slice(0, 5).reduce((sum, hit) => sum + hit.score, 0) / Math.min(5, hits.length);
  const weak = hits[0].score < 0.22;
  const conflict = categories.size > 1;
  let warning: string | null = null;
  if (weak) warning = 'The closest knowledge article is only weakly similar. Treat the steps as a hint, not a procedure.';
  else if (conflict) warning = 'Retrieved articles disagree on the category. Confirm the affected system before acting.';
  const problem = hits[0].body.split('\n').find((line) => line.trim().length > 0) ?? hits[0].title;
  return {
    problem,
    steps,
    references: hits.slice(0, 5).map((hit) => ({
      id: hit.id,
      title: hit.title,
      score: Number(hit.score.toFixed(4)),
      sourceType: hit.sourceType,
    })),
    confidence: Number(Math.max(0, Math.min(1, mean)).toFixed(4)),
    warning,
    grounded: steps.length > 0,
    generator: 'extractive',
  };
}

export function monolithicRecommendation(category: Category): ResolutionDraft {
  const generic = genericSteps(category);
  return {
    problem: generic.problem,
    steps: generic.steps,
    references: [],
    confidence: 0.34,
    warning: 'This baseline does not retrieve evidence. The steps are generic category text, not approved guidance.',
    grounded: false,
    generator: 'monolithic-template',
  };
}

export function usefulnessScore(steps: string[], gold: string, retrievedKeys: (string | null)[], goldKey: string, grounded: boolean): number {
  const goldTokens = new Set(
    gold
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3),
  );
  const stepText = steps.join(' ').toLowerCase();
  let found = 0;
  for (const token of goldTokens) if (stepText.includes(token)) found += 1;
  const overlap = goldTokens.size === 0 ? 0 : found / goldTokens.size;
  const hit = retrievedKeys.includes(goldKey) ? 1 : 0;
  const score = 0.5 * overlap + 0.35 * hit + 0.15 * (grounded ? 1 : 0);
  return Math.max(0, Math.min(1, score));
}
