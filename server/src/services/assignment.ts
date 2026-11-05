import type { AuthUser } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

export async function specialistFor(category: string) {
  return prisma.user.findFirst({
    where: { role: 'TECHNICIAN', active: true, supportCategory: category },
    orderBy: { name: 'asc' },
  });
}

export function canWorkTicket(user: AuthUser, ticket: { category: string | null; assignedToId: string | null }): boolean {
  if (user.role === 'MANAGER' || user.role === 'ADMIN') return true;
  if (user.role !== 'TECHNICIAN') return false;
  if (!user.supportCategory) return true;
  return ticket.assignedToId === user.id || ticket.category === user.supportCategory;
}
