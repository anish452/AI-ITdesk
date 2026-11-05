import { Prisma } from '@prisma/client';
import { articleBody, DISTRACTORS, expandScenario, materialiseRecords, scenarios } from '../src/data/scenarios.js';
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
  const specialists = [
    { name: 'Mei Chen', email: 'mei.chen@northline.example', supportCategory: 'ERP', department: 'ERP Support', plant: 'Auckland Pack' },
    { name: 'Noah Bennett', email: 'noah.bennett@northline.example', supportCategory: 'MES', department: 'MES Support', plant: 'Hamilton Process' },
    { name: 'Aroha Te Rangi', email: 'aroha.terangi@northline.example', supportCategory: 'IDENTITY_ACCESS', department: 'Identity & Access', plant: 'Auckland Pack' },
    { name: 'Liam Fraser', email: 'liam.fraser@northline.example', supportCategory: 'NETWORK', department: 'Network Operations', plant: 'Tauranga Logistics' },
    { name: 'Sofia Alvarez', email: 'sofia.alvarez@northline.example', supportCategory: 'HARDWARE', department: 'Hardware Support', plant: 'Hamilton Process' },
    { name: 'Daniel Brooks', email: 'daniel.brooks@northline.example', supportCategory: 'SOFTWARE', department: 'Software Support', plant: 'Auckland Pack' },
    { name: 'Priyanka Rao', email: 'priyanka.rao@northline.example', supportCategory: 'CYBERSECURITY', department: 'Cybersecurity', plant: 'Auckland Pack' },
  ] as const;
  const [priya, sam, james, helena, admin] = await Promise.all([
    prisma.user.create({ data: { name: 'Priya Shah', email: 'priya.shah@northline.example', passwordHash, role: 'EMPLOYEE', department: 'Procurement', plant: 'Auckland Pack' } }),
    prisma.user.create({ data: { name: 'Sam Cole', email: 'sam.cole@northline.example', passwordHash, role: 'EMPLOYEE', department: 'Warehouse', plant: 'Tauranga Logistics' } }),
    prisma.user.create({ data: { name: 'James Okonkwo', email: 'james.okonkwo@northline.example', passwordHash, role: 'TECHNICIAN', department: 'IT Operations', plant: 'Hamilton Process', supportCategory: null } }),
    prisma.user.create({ data: { name: 'Helena Voss', email: 'helena.voss@northline.example', passwordHash, role: 'MANAGER', department: 'Service Management', plant: 'Auckland Pack' } }),
    prisma.user.create({ data: { name: 'Alex Nguyen', email: 'admin@northline.example', passwordHash, role: 'ADMIN', department: 'Platform', plant: 'Auckland Pack' } }),
    ...specialists.map((person) => prisma.user.create({
      data: { name: person.name, email: person.email, passwordHash, role: 'TECHNICIAN', department: person.department, plant: person.plant, supportCategory: person.supportCategory },
    })),
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

  const requesters = [priya, sam];
  const samples: { key: string; title: string; description: string; affectedSystem: string }[] = scenarios.map((scenario, index) => {
    const expanded = expandScenario(scenario, index);
    return { key: scenario.key, title: expanded.title, description: expanded.description, affectedSystem: scenario.system };
  });
  const outlook = scenarios.find((scenario) => scenario.key === 'sw-outlook');
  if (outlook) {
    const expanded = expandScenario(outlook, 100);
    samples.push({ key: outlook.key, title: expanded.title, description: expanded.description, affectedSystem: outlook.system });
  }
  samples.push({
    key: 'unclear',
    title: 'Things are broken please help',
    description: 'Computer not working on the floor. Please help soon.',
    affectedSystem: 'Not specified',
  });

  const created: { id: string; key: string }[] = [];
  for (const [index, item] of samples.entries()) {
    const requester = requesters[index % requesters.length];
    const ticket = await prisma.ticket.create({
      data: {
        requesterId: requester.id,
        requesterRole: requester.role,
        department: requester.department,
        plant: requester.plant,
        title: item.title,
        description: item.description,
        affectedSystem: item.affectedSystem,
        status: 'SUBMITTED',
      },
    });
    await runPipeline(ticket.id);
    created.push({ id: ticket.id, key: item.key });
  }

  const scanner = created.find((item) => item.key === 'hw-scanner');
  if (scanner) {
    await prisma.ticket.update({ where: { id: scanner.id }, data: { status: 'IN_PROGRESS' } });
    const scannerRecommendation = await prisma.recommendation.findFirst({ where: { ticketId: scanner.id }, orderBy: { createdAt: 'desc' } });
    if (scannerRecommendation) {
      await prisma.recommendation.update({
        where: { id: scannerRecommendation.id },
        data: { accepted: true, usefulness: 5, technicianNote: 'The spare-pool swap matches what the bench needs. Wireless was left unchanged.' },
      });
    }
  }

  const phishing = created.find((item) => item.key === 'cy-phish');
  const phishingScenario = scenarios.find((scenario) => scenario.key === 'cy-phish');
  if (phishing && phishingScenario) {
    await prisma.ticket.update({
      where: { id: phishing.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        outcome: 'SUCCESS',
        resolution: phishingScenario.resolution,
      },
    });
    const phishingRecommendation = await prisma.recommendation.findFirst({ where: { ticketId: phishing.id }, orderBy: { createdAt: 'desc' } });
    if (phishingRecommendation) {
      await prisma.recommendation.update({
        where: { id: phishingRecommendation.id },
        data: { accepted: true, usefulness: 4, technicianNote: 'Used the containment steps and left the plant firewall alone.' },
      });
    }
    await runLearning(phishing.id);
  }

  await prisma.auditLog.create({
    data: {
      actorId: helena.id,
      actorEmail: helena.email,
      action: 'desk.seeded',
      entityType: 'Setting',
      entityId: '1',
      details: { note: `Demonstration data loaded for the COMP903 prototype. ${created.length} requests allocated by category.` },
    },
  });
  console.log(`Seeded Northline Desk with ${created.length} requests.`);
  console.log(`Password for every demonstration account: ${password}`);
  console.log('Specialists:', specialists.map((person) => `${person.email} (${person.supportCategory})`).join(', '));
  void admin;
  void james;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
