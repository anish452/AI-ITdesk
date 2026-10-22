import { prisma } from '../src/lib/prisma.js';

await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
await prisma.$disconnect();
console.log('pgvector extension is available');
