import { PrismaClient } from '@prisma/client';

export const prisma = process.env.MEMORY_MODE === 'true'
  && process.env.PGLITE_MODE !== 'true'
  ? (await import('./memoryPrisma.js')).memoryPrisma
  : new PrismaClient();
