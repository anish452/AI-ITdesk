import { Router } from 'express';
import { z } from 'zod';
import { CATEGORIES, PRIORITIES, URGENCIES } from '../domain.js';
import { audit } from '../lib/audit.js';
import { checkPassword, hashPassword, signToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { enqueueLearning, enqueuePipeline, queueReady } from '../jobs/queue.js';
import { hypothesisVerdict, runExperiment } from '../nlp/experiment.js';
import { llmEnabled } from '../config.js';
import { rebuildRecommendation } from '../services/pipeline.js';
import { storeArticle } from '../services/knowledge.js';

const router = Router();

const ticketInclude = {
  requester: { select: { id: true, name: true, email: true, department: true, plant: true, role: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  classifications: { orderBy: { createdAt: 'desc' as const } },
  recommendations: { orderBy: { createdAt: 'desc' as const } },
  retrievals: { orderBy: { createdAt: 'desc' as const } },
  messages: { orderBy: { createdAt: 'asc' as const } },
};

function publicUser<T extends { passwordHash?: string }>(user: T): Omit<T, 'passwordHash'> {
  const copy = { ...user };
  delete copy.passwordHash;
  return copy;
}

router.get('/health', async (_req, res) => {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  res.json({
    ok: database,
    database,
    redis: queueReady(),
    languageModel: llmEnabled() ? 'configured' : 'local-extractive',
  });
});

router.post('/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter an email address and password.' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.active || !(await checkPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'Those credentials were not recognised.' });
    return;
  }
  const profile = publicUser(user);
  res.json({ token: signToken(profile), user: profile });
});

router.get('/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  res.json({ user: publicUser(user) });
});

router.get('/tickets', requireAuth, async (req, res) => {
  const where = req.user!.role === 'EMPLOYEE' ? { requesterId: req.user!.id } : {};
  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { requester: { select: { name: true, department: true, plant: true } }, assignedTo: { select: { name: true } } },
  });
  res.json({ tickets });
});

router.get('/tickets/:id', requireAuth, async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: ticketInclude });
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found.' });
    return;
  }
  if (req.user!.role === 'EMPLOYEE' && ticket.requesterId !== req.user!.id) {
    res.status(403).json({ error: 'You can only open your own requests.' });
    return;
  }
  res.json({ ticket });
});

router.post('/tickets', requireAuth, async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(8).max(160),
      description: z.string().min(12).max(4000),
      affectedSystem: z.string().min(2).max(80).optional(),
      plant: z.string().min(2).max(80).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Give the request a title and a description of what happened.' });
    return;
  }
  const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!me) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  const ticket = await prisma.ticket.create({
    data: {
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      requesterId: me.id,
      requesterRole: me.role,
      department: me.department,
      plant: parsed.data.plant?.trim() || me.plant,
      affectedSystem: parsed.data.affectedSystem?.trim() || 'Not specified',
      status: 'SUBMITTED',
    },
  });
  await audit({ actorId: me.id, actorEmail: me.email, action: 'ticket.created', entityType: 'Ticket', entityId: ticket.id, details: { title: ticket.title } });
  await enqueuePipeline(ticket.id);
  const fresh = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: ticketInclude });
  res.status(201).json({ ticket: fresh });
});

router.post('/tickets/:id/reprocess', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (req, res) => {
  await enqueuePipeline(req.params.id);
  res.json({ ok: true });
});

router.patch('/tickets/:id/classification', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (req, res) => {
  const parsed = z
    .object({
      category: z.enum(CATEGORIES),
      urgency: z.enum(URGENCIES),
      priority: z.enum(PRIORITIES),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Choose a category, urgency, and priority.' });
    return;
  }
  const ticket = await prisma.ticket.update({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      confidence: 1,
      escalated: false,
      escalationReason: null,
      status: 'PENDING_REVIEW',
      assignedToId: req.user!.id,
    },
  });
  await prisma.classificationResult.create({
    data: {
      ticketId: ticket.id,
      agent: 'technician',
      category: parsed.data.category,
      urgency: parsed.data.urgency,
      priority: parsed.data.priority,
      confidence: 1,
      rationale: `Confirmed by ${req.user!.name}. The human decision replaces the agent suggestion for this ticket.`,
      latencyMs: 0,
      payload: parsed.data,
    },
  });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'classification.overridden', entityType: 'Ticket', entityId: ticket.id, details: parsed.data });
  res.json({ ticket });
});

router.post('/tickets/:id/recommend', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (req, res) => {
  await rebuildRecommendation(req.params.id);
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: ticketInclude });
  res.json({ ticket });
});

router.post('/tickets/:id/feedback', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (req, res) => {
  const parsed = z
    .object({
      usefulness: z.number().int().min(1).max(5),
      accepted: z.boolean(),
      note: z.string().max(2000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Rate the recommendation from 1 to 5 and accept or reject it.' });
    return;
  }
  const latest = await prisma.recommendation.findFirst({ where: { ticketId: req.params.id }, orderBy: { createdAt: 'desc' } });
  if (!latest) {
    res.status(404).json({ error: 'There is no recommendation on this ticket yet.' });
    return;
  }
  await prisma.recommendation.update({
    where: { id: latest.id },
    data: { usefulness: parsed.data.usefulness, accepted: parsed.data.accepted, technicianNote: parsed.data.note ?? null },
  });
  await prisma.ticket.update({ where: { id: req.params.id }, data: { status: 'IN_PROGRESS', assignedToId: req.user!.id } });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'recommendation.reviewed', entityType: 'Ticket', entityId: req.params.id, details: parsed.data });
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: ticketInclude });
  res.json({ ticket });
});

router.post('/tickets/:id/resolve', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (req, res) => {
  const parsed = z
    .object({
      resolution: z.string().min(20).max(4000),
      outcome: z.enum(['SUCCESS', 'PARTIAL', 'FAILED']),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Record what you did and whether it resolved the request. The desk does not close a ticket without that note.' });
    return;
  }
  const ticket = await prisma.ticket.update({
    where: { id: req.params.id },
    data: {
      resolution: parsed.data.resolution.trim(),
      outcome: parsed.data.outcome,
      status: 'RESOLVED',
      resolvedAt: new Date(),
      assignedToId: req.user!.id,
      escalated: false,
    },
  });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'ticket.resolved', entityType: 'Ticket', entityId: ticket.id, details: { outcome: parsed.data.outcome } });
  await enqueueLearning(ticket.id);
  const fresh = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: ticketInclude });
  res.json({ ticket: fresh });
});

router.get('/knowledge', requireAuth, async (_req, res) => {
  const articles = await prisma.knowledgeArticle.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, body: true, category: true, system: true, sourceType: true, approved: true, qualityScore: true, scenarioKey: true, createdAt: true,
    },
  });
  res.json({ articles });
});

router.post('/knowledge', requireAuth, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(8).max(180),
      body: z.string().min(40),
      category: z.enum(CATEGORIES),
      system: z.string().min(2).max(80),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'An article needs a title, a category, a system, and troubleshooting text.' });
    return;
  }
  const id = await storeArticle({ ...parsed.data, sourceType: 'APPROVED_ARTICLE', approved: true, qualityScore: 1 });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'knowledge.created', entityType: 'KnowledgeArticle', entityId: id });
  res.status(201).json({ id });
});

router.patch('/knowledge/:id', requireAuth, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  const parsed = z.object({ approved: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Say whether the article is approved for retrieval.' });
    return;
  }
  const article = await prisma.knowledgeArticle.update({ where: { id: req.params.id }, data: { approved: parsed.data.approved } });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'knowledge.approval', entityType: 'KnowledgeArticle', entityId: article.id, details: parsed.data });
  res.json({ article: { id: article.id, approved: article.approved } });
});

router.get('/rules', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (_req, res) => {
  const rules = await prisma.candidateRule.findMany({ orderBy: { updatedAt: 'desc' } });
  res.json({ rules });
});

router.post('/rules/:id/decision', requireAuth, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  const parsed = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Approve or reject the candidate rule.' });
    return;
  }
  const rule = await prisma.candidateRule.update({ where: { id: req.params.id }, data: { status: parsed.data.status } });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'rule.decision', entityType: 'CandidateRule', entityId: rule.id, details: parsed.data });
  res.json({ rule });
});

router.get('/learning', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (_req, res) => {
  const reports = await prisma.learningReport.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  res.json({ reports });
});

router.get('/dashboard', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (_req, res) => {
  const [tickets, recommendations, settings, learning] = await Promise.all([
    prisma.ticket.findMany({ select: { status: true, category: true, confidence: true, escalated: true } }),
    prisma.recommendation.findMany({ where: { usefulness: { not: null } }, select: { usefulness: true, accepted: true } }),
    prisma.setting.findUnique({ where: { id: 1 } }),
    prisma.learningReport.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);
  const byCategory: Record<string, number> = {};
  for (const ticket of tickets) if (ticket.category) byCategory[ticket.category] = (byCategory[ticket.category] ?? 0) + 1;
  const rated = recommendations.length;
  const accepted = recommendations.filter((item) => item.accepted).length;
  const confidenceValues = tickets.map((ticket) => ticket.confidence).filter((value): value is number => value != null);
  res.json({
    counts: {
      total: tickets.length,
      open: tickets.filter((ticket) => ticket.status !== 'RESOLVED').length,
      escalated: tickets.filter((ticket) => ticket.status === 'ESCALATED').length,
      pending: tickets.filter((ticket) => ticket.status === 'PENDING_REVIEW').length,
      resolved: tickets.filter((ticket) => ticket.status === 'RESOLVED').length,
    },
    acceptanceRate: rated === 0 ? null : accepted / rated,
    averageUsefulness: rated === 0 ? null : recommendations.reduce((sum, item) => sum + (item.usefulness ?? 0), 0) / rated,
    averageConfidence: confidenceValues.length === 0 ? null : confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length,
    byCategory,
    threshold: settings?.confidenceThreshold ?? 0.42,
    orgName: settings?.orgName ?? 'Northline Manufacturing',
    learning,
    languageModel: llmEnabled() ? 'external' : 'local-extractive',
  });
});

router.post('/evaluation', requireAuth, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  const started = performance.now();
  const metrics = runExperiment();
  const hypotheses = hypothesisVerdict(metrics);
  const run = await prisma.evaluationRun.create({
    data: {
      label: 'Held-out synthetic manufacturing tickets',
      metrics,
      hypotheses,
      durationMs: Math.round(performance.now() - started),
    },
  });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'evaluation.completed', entityType: 'EvaluationRun', entityId: run.id });
  res.json({ run });
});

router.get('/evaluation', requireAuth, requireRole('TECHNICIAN', 'MANAGER', 'ADMIN'), async (_req, res) => {
  const runs = await prisma.evaluationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 8 });
  res.json({ runs });
});

router.get('/settings', requireAuth, async (_req, res) => {
  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  res.json({ settings, languageModel: llmEnabled() ? 'external' : 'local-extractive' });
});

router.patch('/settings', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const parsed = z.object({ confidenceThreshold: z.number().min(0.05).max(0.95) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'The confidence threshold must be between 0.05 and 0.95.' });
    return;
  }
  const settings = await prisma.setting.upsert({
    where: { id: 1 },
    update: { confidenceThreshold: parsed.data.confidenceThreshold },
    create: { id: 1, confidenceThreshold: parsed.data.confidenceThreshold },
  });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'settings.updated', entityType: 'Setting', entityId: '1', details: parsed.data });
  res.json({ settings });
});

router.get('/users', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  res.json({ users: users.map((user) => publicUser(user)) });
});

router.post('/users', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(3),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(['EMPLOYEE', 'TECHNICIAN', 'MANAGER', 'ADMIN']),
      department: z.string().min(2),
      plant: z.string().min(2),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Name, email, a password of at least 8 characters, role, department, and plant are required.' });
    return;
  }
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      department: parsed.data.department,
      plant: parsed.data.plant,
    },
  });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'user.created', entityType: 'User', entityId: user.id, details: { email: user.email, role: user.role } });
  res.status(201).json({ user: publicUser(user) });
});

router.patch('/users/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Say whether the account is active.' });
    return;
  }
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { active: parsed.data.active } });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'user.updated', entityType: 'User', entityId: user.id, details: parsed.data });
  res.json({ user: publicUser(user) });
});

router.get('/audit', requireAuth, requireRole('MANAGER', 'ADMIN'), async (_req, res) => {
  const events = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 80 });
  res.json({ events });
});

export default router;
