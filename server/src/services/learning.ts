import { prisma } from '../lib/prisma.js';
import { getBundle } from '../lib/models.js';
import { audit } from '../lib/audit.js';
import { storeArticle } from './knowledge.js';
import { anonymize } from '../nlp/models.js';
import { learnedPatternTerms } from '../nlp/experiment.js';
import { toPgVector } from '../nlp/retrieval.js';
import { Prisma } from '@prisma/client';

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function runLearning(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket?.resolution || !ticket.category) return;
  const anonymised = anonymize(ticket.resolution).trim();
  const details: Record<string, unknown> = { outcome: ticket.outcome, length: anonymised.length };
  let recordsAdded = 0;
  let recordsRejected = 0;
  let rulesUpdated = 0;

  if (ticket.outcome === 'FAILED' || anonymised.length < 40) {
    recordsRejected += 1;
    details.decision = 'REJECTED_QUALITY';
    details.reason = ticket.outcome === 'FAILED'
      ? 'Failed outcomes are kept on the ticket but are not added to retrieval.'
      : 'The resolution is too short to reuse safely.';
  } else {
    const body = [
      `Learned from resolved ticket NL-${1000 + ticket.number}. Category: ${ticket.category}. System: ${ticket.affectedSystem}.`,
      `1. ${anonymised}`,
      '2. A technician recorded this outcome. The underlying model weights were not changed.',
    ].join('\n');
    const vector = toPgVector(getBundle().vectorizer.transform(`${ticket.title}\n${body}`));
    const nearest = await prisma.$queryRaw<{ score: number }[]>(Prisma.sql`
      SELECT (1 - (embedding <=> ${Prisma.raw(`'${vector}'::vector`)}))::float8 AS score
      FROM "KnowledgeArticle"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${Prisma.raw(`'${vector}'::vector`)}
      LIMIT 1
    `);
    const nearestScore = Number(nearest[0]?.score ?? 0);
    if (nearestScore > 0.94) {
      recordsRejected += 1;
      details.decision = 'REJECTED_DUPLICATE';
      details.reason = `An existing knowledge record is already very similar (${nearestScore.toFixed(2)}).`;
    } else {
      const approved = ticket.outcome === 'SUCCESS';
      await storeArticle({
        title: `Learned pattern: ${ticket.title}`.slice(0, 180),
        body,
        category: ticket.category,
        system: ticket.affectedSystem || 'Service desk',
        sourceType: 'LEARNED_PATTERN',
        approved,
        qualityScore: approved ? 0.84 : 0.6,
        scenarioKey: null,
      });
      recordsAdded += 1;
      details.decision = approved ? 'ADDED' : 'ADDED_PENDING_APPROVAL';
      details.reason = approved
        ? 'The anonymised resolution was added to retrieval.'
        : 'The pattern was stored but will not be retrieved until a manager approves it.';
    }
  }

  const terms = learnedPatternTerms(ticket.category, anonymised);
  const existing = await prisma.candidateRule.findMany({ where: { category: ticket.category, status: { not: 'REJECTED' } } });
  const match = existing.find((rule) => jaccard(rule.pattern.split(' '), terms) >= 0.6);
  if (match) {
    await prisma.candidateRule.update({ where: { id: match.id }, data: { supportCount: match.supportCount + 1, exampleTicketId: ticketId } });
    rulesUpdated += 1;
  } else if (anonymised.length >= 40) {
    await prisma.candidateRule.create({
      data: {
        category: ticket.category,
        pattern: terms.join(' '),
        conditionText: `When a ${ticket.category} request mentions ${terms.slice(1).join(', ') || 'this pattern'}.`,
        suggestedAction: anonymised.slice(0, 400),
        exampleTicketId: ticketId,
      },
    });
    rulesUpdated += 1;
  }

  const summary = recordsAdded
    ? 'Learning agent stored an anonymised resolution without fine-tuning the model.'
    : 'Learning agent reviewed the resolution and did not add a new retrieval record.';
  const reportBody = { summary, recordsAdded, recordsRejected, rulesUpdated, details } as Prisma.InputJsonValue;
  await prisma.learningReport.create({
    data: { ticketId, summary, recordsAdded, recordsRejected, rulesUpdated, details: details as Prisma.InputJsonValue },
  });
  await prisma.agentMessage.create({
    data: {
      ticketId,
      fromAgent: 'learning',
      toAgent: 'knowledge-base',
      type: 'learning.report',
      body: reportBody,
    },
  });
  await audit({
    action: 'learning.completed',
    entityType: 'Ticket',
    entityId: ticketId,
    details: { recordsAdded, recordsRejected, rulesUpdated },
  });
}
