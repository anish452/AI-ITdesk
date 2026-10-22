import { Prisma } from '@prisma/client';
import { articleBody, DISTRACTORS, materialiseRecords, scenarios } from '../src/data/scenarios.js';
import { hashPassword } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';
import { warmModels } from '../src/lib/models.js';
import { toPgVector } from '../src/nlp/retrieval.js';
import { runPipeline } from '../src/services/pipeline.js';
import { runLearning } from '../src/services/learning.js';

const password = 'Northline#903';

async function embed(id: string, title: string, body: string): Promise<void> {
  const vector = toPgVector(warmModels().vectorizer.transform(`${title}\n${body}`));
  await prisma.$executeRawUnsafe(`UPDATE "KnowledgeArticle" SET embedding = $1::vector WHERE id = $2`, vector, id);
}

async function main(): Promise<void> {
  warmModels();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "EvaluationRun",
      "LearningReport",
      "CandidateRule",
      "AgentMessage",
      "Recommendation",
      "RetrievalLog",
      "ClassificationResult",
      "Ticket",
      "DatasetRecord",
      "KnowledgeArticle",
      "User",
      "Setting"
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await hashPassword(password);
  const [priya, sam, james, helena, admin] = await Promise.all([
    prisma.user.create({ data: { name: 'Priya Shah', email: 'priya.shah@northline.example', passwordHash, role: 'EMPLOYEE', department: 'Procurement', plant: 'Auckland Pack' } }),
    prisma.user.create({ data: { name: 'Sam Cole', email: 'sam.cole@northline.example', passwordHash, role: 'EMPLOYEE', department: 'Warehouse', plant: 'Tauranga Logistics' } }),
    prisma.user.create({ data: { name: 'James Okonkwo', email: 'james.okonkwo@northline.example', passwordHash, role: 'TECHNICIAN', department: 'IT Operations', plant: 'Hamilton Process' } }),
    prisma.user.create({ data: { name: 'Helena Voss', email: 'helena.voss@northline.example', passwordHash, role: 'MANAGER', department: 'Service Management', plant: 'Auckland Pack' } }),
    prisma.user.create({ data: { name: 'Alex Nguyen', email: 'admin@northline.example', passwordHash, role: 'ADMIN', department: 'Platform', plant: 'Auckland Pack' } }),
  ]);
  await prisma.setting.create({ data: { id: 1, confidenceThreshold: 0.42, orgName: 'Northline Manufacturing' } });
  await prisma.datasetRecord.createMany({ data: materialiseRecords() });

  for (const scenario of scenarios) {
    const body = articleBody(scenario);
    const article = await prisma.knowledgeArticle.create({
      data: {
        title: scenario.articleTitle,
        body,
        category: scenario.category,
        system: scenario.system,
        sourceType: 'APPROVED_ARTICLE',
        approved: true,
        qualityScore: 1,
        scenarioKey: scenario.key,
      },
    });
    await embed(article.id, scenario.articleTitle, body);
  }
  for (const distractor of DISTRACTORS) {
    const article = await prisma.knowledgeArticle.create({
      data: {
        title: distractor.title,
        body: distractor.body,
        category: distractor.category,
        system: distractor.system,
        sourceType: 'APPROVED_ARTICLE',
        approved: true,
        qualityScore: 0.35,
        scenarioKey: null,
      },
    });
    await embed(article.id, distractor.title, distractor.body);
  }

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS knowledge_embedding_hnsw
    ON "KnowledgeArticle" USING hnsw (embedding vector_cosine_ops)
  `).catch(() => undefined);

  const demo = [
    {
      requesterId: priya.id,
      requesterRole: priya.role,
      department: priya.department,
      plant: priya.plant,
      title: 'Cannot open purchase order 4500019020 in SAP',
      description: 'The buyer at Auckland Pack cannot open purchase order 4500019020. Transaction ME21N shows an hourglass and never reaches the header. It started after the SAP GUI patch. Procurement is waiting.',
      affectedSystem: 'SAP S/4HANA',
    },
    {
      requesterId: priya.id,
      requesterRole: priya.role,
      department: priya.department,
      plant: priya.plant,
      title: 'Things are broken please help',
      description: 'Computer not working on the floor. Please help soon.',
      affectedSystem: 'Not specified',
    },
    {
      requesterId: sam.id,
      requesterRole: sam.role,
      department: sam.department,
      plant: sam.plant,
      title: 'Handheld scanner will not pair at shipping',
      description: 'One scanner at the Tauranga Logistics shipping bench will not pair with its cradle. Other scanners on the same wifi are working, so the network is up. This bench cannot confirm the outbound pallet.',
      affectedSystem: 'Shop-floor hardware',
    },
    {
      requesterId: sam.id,
      requesterRole: sam.role,
      department: sam.department,
      plant: sam.plant,
      title: 'I entered my password on a payroll phishing page',
      description: 'An employee at Tauranga Logistics clicked a payroll phishing link and typed their password. The page was not the real portal. Please contain the account. This is a security incident, not a normal lockout.',
      affectedSystem: 'Security operations',
    },
  ];

  const created = [];
  for (const item of demo) {
    const ticket = await prisma.ticket.create({ data: { ...item, status: 'SUBMITTED' } });
    await runPipeline(ticket.id);
    created.push(ticket.id);
  }

  await prisma.ticket.update({
    where: { id: created[2] },
    data: { status: 'IN_PROGRESS', assignedToId: james.id },
  });
  const scannerRecommendation = await prisma.recommendation.findFirst({ where: { ticketId: created[2] }, orderBy: { createdAt: 'desc' } });
  if (scannerRecommendation) {
    await prisma.recommendation.update({
      where: { id: scannerRecommendation.id },
      data: { accepted: true, usefulness: 5, technicianNote: 'The spare-pool swap matches what the bench needs. Wireless was left unchanged.' },
    });
  }

  await prisma.ticket.update({
    where: { id: created[3] },
    data: {
      status: 'RESOLVED',
      assignedToId: james.id,
      resolvedAt: new Date(),
      outcome: 'SUCCESS',
      resolution:
        'Night-shift lead at Tauranga confirmed the employee was on the packing mezzanine, not travelling. Reset the exposed credential, revoked refresh tokens, and quarantined gateway message PH-441 for the payroll-themed lure. Bank details were unchanged. No firewall edit and no server restart.',
    },
  });
  const phishingRecommendation = await prisma.recommendation.findFirst({ where: { ticketId: created[3] }, orderBy: { createdAt: 'desc' } });
  if (phishingRecommendation) {
    await prisma.recommendation.update({
      where: { id: phishingRecommendation.id },
      data: { accepted: true, usefulness: 4, technicianNote: 'Used the containment steps and left the plant firewall alone.' },
    });
  }
  await runLearning(created[3]);

  await prisma.auditLog.create({
    data: {
      actorId: helena.id,
      actorEmail: helena.email,
      action: 'desk.seeded',
      entityType: 'Setting',
      entityId: '1',
      details: { note: 'Demonstration data loaded for the COMP903 prototype.' },
    },
  });
  console.log('Seeded Northline Desk.');
  console.log(`Password for every demonstration account: ${password}`);
  console.log('admin@northline.example, helena.voss@northline.example, james.okonkwo@northline.example, priya.shah@northline.example, sam.cole@northline.example');
  void admin;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
