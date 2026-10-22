import { Prisma } from '@prisma/client';
import { config, llmEnabled } from '../config.js';
import type { Category, ResolutionDraft, RetrievedHit } from '../domain.js';
import { prisma } from '../lib/prisma.js';
import { getBundle } from '../lib/models.js';
import { extractiveRecommendation } from '../nlp/retrieval.js';
import { toPgVector } from '../nlp/retrieval.js';

type HitRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  system: string;
  sourceType: string;
  scenarioKey: string | null;
  score: number;
};

export async function retrieveEvidence(queryText: string, limit = 5): Promise<{ hits: RetrievedHit[]; latencyMs: number }> {
  const started = performance.now();
  const vector = toPgVector(getBundle().vectorizer.transform(queryText));
  const rows = await prisma.$queryRaw<HitRow[]>(Prisma.sql`
    SELECT id, title, body, category, system,
           "sourceType" AS "sourceType",
           "scenarioKey" AS "scenarioKey",
           (1 - (embedding <=> ${Prisma.raw(`'${vector}'::vector`)}))::float8 AS score
    FROM "KnowledgeArticle"
    WHERE approved = true AND embedding IS NOT NULL
    ORDER BY embedding <=> ${Prisma.raw(`'${vector}'::vector`)}
    LIMIT ${limit}
  `);
  return {
    hits: rows.map((row) => ({ ...row, score: Number(row.score) })),
    latencyMs: Math.round(performance.now() - started),
  };
}

export async function storeArticle(input: {
  title: string;
  body: string;
  category: string;
  system: string;
  sourceType: string;
  approved: boolean;
  qualityScore: number;
  scenarioKey?: string | null;
}): Promise<string> {
  const created = await prisma.knowledgeArticle.create({
    data: {
      title: input.title,
      body: input.body,
      category: input.category,
      system: input.system,
      sourceType: input.sourceType,
      approved: input.approved,
      qualityScore: input.qualityScore,
      scenarioKey: input.scenarioKey ?? null,
    },
  });
  const vector = toPgVector(getBundle().vectorizer.transform(`${input.title}\n${input.body}`));
  await prisma.$executeRawUnsafe(`UPDATE "KnowledgeArticle" SET embedding = $1::vector WHERE id = $2`, vector, created.id);
  return created.id;
}

async function withLanguageModel(ticket: { title: string; description: string; category: string }, hits: RetrievedHit[], fallback: ResolutionDraft): Promise<ResolutionDraft> {
  if (!llmEnabled()) return fallback;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.llmApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.llmModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are the resolution recommendation agent for a manufacturing IT service desk. Use only the retrieved evidence. Do not tell the technician to restart servers, change firewall rules, disable security controls, or close the ticket. Return JSON with keys problem (string), steps (array of strings), warning (string or null), confidence (number from 0 to 1).',
          },
          {
            role: 'user',
            content: JSON.stringify({
              ticket,
              evidence: hits.map((hit) => ({ title: hit.title, sourceType: hit.sourceType, body: hit.body.slice(0, 1400) })),
            }),
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return fallback;
    const parsed = JSON.parse(content) as { problem?: string; steps?: string[]; warning?: string | null; confidence?: number };
    if (!parsed.problem || !Array.isArray(parsed.steps)) return fallback;
    return {
      problem: parsed.problem,
      steps: parsed.steps.slice(0, 6),
      references: fallback.references,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? fallback.confidence))),
      warning: parsed.warning ?? fallback.warning,
      grounded: true,
      generator: `llm:${config.llmModel}`,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function recommend(input: {
  title: string;
  description: string;
  category: Category | string;
  affectedSystem: string;
}): Promise<{ draft: ResolutionDraft; hits: RetrievedHit[]; latencyMs: number }> {
  const query = `${input.title}\n${input.description}\nCategory: ${input.category}. System: ${input.affectedSystem}.`;
  const retrieved = await retrieveEvidence(query, 5);
  const extractive = extractiveRecommendation(retrieved.hits);
  const draft = await withLanguageModel(
    { title: input.title, description: input.description, category: String(input.category) },
    retrieved.hits,
    extractive,
  );
  return { draft, hits: retrieved.hits, latencyMs: retrieved.latencyMs };
}
