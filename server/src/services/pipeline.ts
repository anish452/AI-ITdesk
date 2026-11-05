import { urgencyRank, type ClassifiedTicket, type Priority, type Urgency } from '../domain.js';
import { prisma } from '../lib/prisma.js';
import { getBundle } from '../lib/models.js';
import { audit } from '../lib/audit.js';
import { specialistFor } from './assignment.js';
import { recommend } from './knowledge.js';

function message(fromAgent: string, toAgent: string, type: string, body: unknown) {
  return { fromAgent, toAgent, type, body: body as object };
}

async function appliedDecision(ticketId: string, classification: ClassifiedTicket, threshold: number) {
  const human = await prisma.classificationResult.findFirst({
    where: { ticketId, agent: { in: ['requester', 'technician'] } },
    orderBy: { createdAt: 'desc' },
  });
  let category = human?.category ?? classification.category;
  let urgency = classification.urgency;
  let priority = classification.priority;
  if (human?.agent === 'technician') {
    urgency = human.urgency as Urgency;
    priority = human.priority as Priority;
  }
  if (category === 'CYBERSECURITY' && urgencyRank(urgency) < urgencyRank('HIGH')) {
    urgency = 'HIGH';
    priority = 'P2';
  }
  const confirmed = human != null;
  const escalated = !confirmed && classification.confidence < threshold;
  const escalationReason = escalated
    ? `Classification confidence ${classification.confidence.toFixed(2)} is below the threshold ${threshold.toFixed(2)}. A technician must confirm the category before treating the recommendation as actionable.`
    : null;
  return { category, urgency, priority, escalated, escalationReason, correctedBy: human?.agent ?? null };
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
  const decision = await appliedDecision(ticketId, classification, threshold);

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
        category: decision.category,
        urgency: decision.urgency,
        priority: decision.priority,
        escalated: decision.escalated,
        threshold,
        correctedBy: decision.correctedBy,
      }),
    },
  });

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: 'RECOMMENDING',
      category: decision.category,
      urgency: decision.urgency,
      priority: decision.priority,
      confidence: decision.correctedBy ? 1 : classification.confidence,
      escalated: decision.escalated,
      escalationReason: decision.escalationReason,
    },
  });

  let chosen = decision;
  let result = await storeRecommendation(ticket, chosen.category, latencyMs, chosen.escalated);
  const latest = await appliedDecision(ticketId, classification, threshold);
  if (latest.category !== chosen.category) {
    chosen = latest;
    result = await storeRecommendation(ticket, chosen.category, latencyMs, chosen.escalated);
  }
  const specialist = await specialistFor(chosen.category);
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
        assignedTo: specialist ? { id: specialist.id, name: specialist.name, category: chosen.category } : null,
      }),
    },
  });
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: chosen.escalated ? 'ESCALATED' : 'PENDING_REVIEW',
      category: chosen.category,
      urgency: chosen.urgency,
      priority: chosen.priority,
      confidence: chosen.correctedBy ? 1 : classification.confidence,
      escalated: chosen.escalated,
      escalationReason: chosen.escalationReason,
      assignedToId: specialist?.id ?? null,
    },
  });
  await audit({
    action: chosen.escalated ? 'ticket.escalated' : 'ticket.classified',
    entityType: 'Ticket',
    entityId: ticketId,
    details: {
      category: chosen.category,
      confidence: classification.confidence,
      threshold,
      correctedBy: chosen.correctedBy,
      assignedTo: specialist?.email ?? null,
    },
  });
}

async function storeRecommendation(
  ticket: { id: string; title: string; description: string; affectedSystem: string },
  category: string,
  extraLatencyMs: number,
  escalated: boolean,
) {
  const result = await recommend({
    title: ticket.title,
    description: ticket.description,
    category,
    affectedSystem: ticket.affectedSystem,
  });
  await prisma.retrievalLog.create({
    data: {
      ticketId: ticket.id,
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
      ticketId: ticket.id,
      method: 'rag',
      problem: result.draft.problem,
      steps: result.draft.steps,
      references: result.draft.references,
      confidence: result.draft.confidence,
      warning: result.draft.warning ?? (escalated ? 'Classification confidence is below the threshold, so this evidence may belong to the wrong category.' : null),
      grounded: result.draft.grounded,
      generator: result.draft.generator,
      latencyMs: result.latencyMs + extraLatencyMs,
    },
  });
  return result;
}

export async function rebuildRecommendation(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket?.category) return;
  await storeRecommendation(ticket, ticket.category, 0, false);
}
