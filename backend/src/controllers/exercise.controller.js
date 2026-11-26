import { prisma } from '../utils/prisma.js';
import {
  equipmentTypes,
  exerciseSchema,
  exerciseUpdateSchema,
  muscleGroups,
} from '../utils/workoutValidation.js';

const exerciseSelect = {
  id: true,
  name: true,
  muscleGroup: true,
  equipment: true,
  description: true,
  difficulty: true,
  exerciseType: true,
  instructions: true,
  imageUrl: true,
  ownerId: true,
};

function invalid(res, parsed) {
  return res.status(400).json({
    error: 'Please check the highlighted fields',
    details: parsed.error.flatten().fieldErrors,
  });
}

export async function listExercises(req, res, next) {
  const { search, muscleGroup, equipment } = req.query;
  if ((muscleGroup && !muscleGroups.includes(muscleGroup))
    || (equipment && !equipmentTypes.includes(equipment))
    || (search && (typeof search !== 'string' || search.length > 100))) {
    return res.status(400).json({ error: 'Invalid exercise search or filter' });
  }
  try {
    const exercises = await prisma.exercise.findMany({
      where: {
        AND: [
          { OR: [{ ownerId: null }, { ownerId: req.user.id }] },
          ...(muscleGroup ? [{ muscleGroup }] : []),
          ...(equipment ? [{ equipment }] : []),
          ...(search ? [{
            OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            ],
          }] : []),
        ],
      },
      select: exerciseSelect,
      orderBy: [{ name: 'asc' }],
    });
    return res.json({ exercises: exercises.map((exercise) => ({ ...exercise, isCustom: Boolean(exercise.ownerId) })) });
  } catch (error) {
    return next(error);
  }
}

export async function getExercise(req, res, next) {
  try {
    const exercise = await prisma.exercise.findFirst({
      where: { id: req.params.id, OR: [{ ownerId: null }, { ownerId: req.user.id }] },
      select: exerciseSelect,
    });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
    return res.json({ exercise: { ...exercise, isCustom: Boolean(exercise.ownerId) } });
  } catch (error) {
    return next(error);
  }
}

async function duplicateExercise(name, ownerId, excludeId) {
  return prisma.exercise.findFirst({
    where: {
      ownerId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function createExercise(req, res, next) {
  const parsed = exerciseSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    if (await duplicateExercise(parsed.data.name, req.user.id)) {
      return res.status(409).json({ error: 'You already have an exercise with that name' });
    }
    const exercise = await prisma.exercise.create({
      data: { ...parsed.data, ownerId: req.user.id },
      select: exerciseSelect,
    });
    return res.status(201).json({ exercise: { ...exercise, isCustom: true } });
  } catch (error) {
    return next(error);
  }
}

export async function updateExercise(req, res, next) {
  const parsed = exerciseUpdateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const owned = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!owned) return res.status(404).json({ error: 'Custom exercise not found' });
    if (parsed.data.name && await duplicateExercise(parsed.data.name, req.user.id, req.params.id)) {
      return res.status(409).json({ error: 'You already have an exercise with that name' });
    }
    const exercise = await prisma.exercise.update({
      where: { id: owned.id },
      data: parsed.data,
      select: exerciseSelect,
    });
    return res.json({ exercise: { ...exercise, isCustom: true } });
  } catch (error) {
    return next(error);
  }
}

export async function deleteExercise(req, res, next) {
  try {
    const owned = await prisma.exercise.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!owned) return res.status(404).json({ error: 'Custom exercise not found' });
    const useCount = await prisma.workoutTemplateExercise.count({ where: { exerciseId: owned.id } });
    if (useCount) return res.status(409).json({ error: 'Remove this exercise from your workout templates before deleting it' });
    await prisma.exercise.delete({ where: { id: owned.id } });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}
