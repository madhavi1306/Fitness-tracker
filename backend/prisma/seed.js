import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedExercises } from '../src/data/exercises.js';
import { seedFoods } from '../src/data/foods.js';

const prisma = new PrismaClient();

try {
  for (const exercise of seedExercises) {
    const existing = await prisma.exercise.findFirst({
      where: { ownerId: null, name: { equals: exercise.name, mode: 'insensitive' } },
      select: { id: true, exerciseType: true },
    });
    if (!existing) {
      await prisma.exercise.create({
        data: exercise,
      });
    } else if (!existing.exerciseType) {
      await prisma.exercise.update({
        where: { id: existing.id },
        data: { exerciseType: exercise.exerciseType },
      });
    }
  }
  for (const food of seedFoods) {
    const existing = await prisma.food.findFirst({
      where: { ownerId: null, name: { equals: food.name, mode: 'insensitive' } },
    });
    if (!existing) await prisma.food.create({ data: { ...food, ownerId: null } });
  }
  console.log(`Seed complete (${seedExercises.length} built-in exercises, ${seedFoods.length} built-in foods).`);
} finally {
  await prisma.$disconnect();
}
