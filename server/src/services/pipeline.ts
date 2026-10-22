import { prisma } from '../lib/prisma.js';
import { getBundle } from '../lib/models.js';
import { audit } from '../lib/audit.js';
import { recommend } from './knowledge.js';

function message(fromAgent: string, toAgent: string, type: string, body: unknown) {
  return { fromAgent, toAgent, type, body: body as object };
}

export async function runPipeline(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  const threshold = settings?.confidenceThreshold ?? 0.42;
  const bundle = getBundle();

  await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'CLASSIFYING' } });
  const started = performance.now();
  const classification = bundle.classificationAgent(ticket.title, ticket.description, ticket.affectedSystem);
  const latencyMs = Math.round(performance.now() - started);
  const escalated = classification.confidence < threshold;
  const escalationReason = escalated
    ? `Classification confidence ${classification.confidence.toFixed(2)} is below the threshold ${threshold.toFixed(2)}. A technician must confirm the category before treating the recommendation as actionable.`
    : null;

  await prisma.classificationResult.create({
    data: {
      ticketId,
      agent: classification.method,
      category: classification.category,
      urgency: classification.urgency,
      priority: classification.priority,
      confidence: classification.confidence,
      rationale: classification.rationale,
      latencyMs,
      payload: classification,
    },
  });
  await prisma.agentMessage.create({
    data: {
      ticketId,
      ...message('orchestrator', 'classification', 'classify.request', {
        ticketId,
        title: ticket.title,
        description: ticket.description,
        requesterRole: ticket.requesterRole,
        affectedSystem: ticket.affectedSystem,
      }),
    },
  });
  await prisma.agentMessage.create({
    data: {
      ticketId,
      ...message('classification', 'recommendation', 'classify.result', {
        ...classification,
        escalated,
        threshold,
      }),
    },
  });

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: 'RECOMMENDING',
      category: classification.category,
      urgency: classification.urgency,
      priority: classification.priority,
      confidence: classification.confidence,
      escalated,
      escalationReason,
    },
  });

  const result = await recommend({
    title: ticket.title,
    description: ticket.description,
    category: classification.category,
    affectedSystem: ticket.affectedSystem,
  });
  await prisma.retrievalLog.create({
    data: {
      ticketId,
      method: 'rag-pgvector',
      latencyMs: result.latencyMs,
      hits: result.hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        category: hit.category,
        sourceType: hit.sourceType,
        score: Number(hit.score.toFixed(4)),
      })),
    },
  });
  await prisma.recommendation.create({
    data: {
      ticketId,
      method: 'rag',
      problem: result.draft.problem,
      steps: result.draft.steps,
      references: result.draft.references,
      confidence: result.draft.confidence,
      warning: result.draft.warning ?? (escalated ? 'Classification confidence is below the threshold, so this evidence may belong to the wrong category.' : null),
      grounded: result.draft.grounded,
      generator: result.draft.generator,
      latencyMs: result.latencyMs + latencyMs,
    },
  });
  await prisma.agentMessage.create({
    data: {
      ticketId,
      ...message('recommendation', 'technician', 'recommendation.ready', {
        problem: result.draft.problem,
        steps: result.draft.steps,
        references: result.draft.references,
        confidence: result.draft.confidence,
        warning: result.draft.warning,
        generator: result.draft.generator,
      }),
    },
  });
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: escalated ? 'ESCALATED' : 'PENDING_REVIEW' },
  });
  await audit({
    action: escalated ? 'ticket.escalated' : 'ticket.classified',
    entityType: 'Ticket',
    entityId: ticketId,
    details: { category: classification.category, confidence: classification.confidence, threshold },
  });
}

export async function rebuildRecommendation(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket?.category) return;
  const result = await recommend({
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    affectedSystem: ticket.affectedSystem,
  });
  await prisma.retrievalLog.create({
    data: {
      ticketId,
      method: 'rag-pgvector',
      latencyMs: result.latencyMs,
      hits: result.hits.map((hit) => ({ id: hit.id, title: hit.title, score: Number(hit.score.toFixed(4)), sourceType: hit.sourceType })),
    },
  });
  await prisma.recommendation.create({
    data: {
      ticketId,
      method: 'rag',
      problem: result.draft.problem,
      steps: result.draft.steps,
      references: result.draft.references,
      confidence: result.draft.confidence,
      warning: result.draft.warning,
      grounded: result.draft.grounded,
      generator: result.draft.generator,
      latencyMs: result.latencyMs,
    },
  });
}
