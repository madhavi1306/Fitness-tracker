import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import {
  generateWorkoutSchedule,
  workoutScheduleConfigSchema,
  workoutScheduleSchema,
} from '../services/workoutSchedule.service.js';

const exerciseInputSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  sets: z.coerce.number().int().min(1).max(20),
  reps: z.coerce.number().int().min(1).max(100),
  restSeconds: z.coerce.number().int().min(0).max(3600),
  notes: z.string().trim().max(500).nullable().optional(),
}).strict();

const dayUpdateSchema = z.object({
  title: z.string().trim().min(1).max(100),
  focus: z.string().trim().min(1).max(100),
  isRestDay: z.boolean(),
  estimatedDurationMinutes: z.coerce.number().int().min(0).max(240),
  warmup: z.string().max(300),
  cooldown: z.string().max(300),
  phase: z.string().max(50),
  guidance: z.string().max(500),
  exercises: z.array(exerciseInputSchema).max(12),
}).strict().superRefine((day, context) => {
  if (day.isRestDay && day.exercises.length) {
    context.addIssue({ code: 'custom', message: 'Rest days cannot include exercises', path: ['exercises'] });
  }
  if (!day.isRestDay && !day.exercises.length) {
    context.addIssue({ code: 'custom', message: 'Training days need at least one exercise', path: ['exercises'] });
  }
});

const planInclude = {
  days: {
    orderBy: { date: 'asc' },
    include: {
      exercises: {
        orderBy: { order: 'asc' },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              muscleGroup: true,
              equipment: true,
              description: true,
              difficulty: true,
              instructions: true,
              imageUrl: true,
            },
          },
        },
      },
    },
  },
};

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateValue(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function invalid(res, parsed) {
  return res.status(400).json({
    error: 'Please check the workout plan fields',
    details: parsed.error.flatten().fieldErrors,
  });
}

async function validateExerciseOwnership(items, ownerId) {
  const ids = [...new Set(items.map((item) => item.exerciseId))];
  if (ids.length !== items.length) return false;
  const found = await prisma.exercise.findMany({
    where: { id: { in: ids }, OR: [{ ownerId: null }, { ownerId }] },
    select: { id: true },
  });
  return found.length === ids.length;
}

function dbExerciseData(exercises) {
  return exercises.map((exercise, order) => ({
    exerciseId: exercise.exerciseId,
    order,
    sets: exercise.sets,
    reps: exercise.reps,
    restSeconds: exercise.restSeconds,
    notes: exercise.notes ?? null,
  }));
}

export async function generateWorkoutPlanRequest(req, res, next) {
  const parsed = workoutScheduleConfigSchema.safeParse({
    ...req.body,
    startDate: req.body?.startDate || new Date().toISOString().slice(0, 10),
  });
  if (!parsed.success) return invalid(res, parsed);
  try {
    const [exercises, history] = await Promise.all([
      prisma.exercise.findMany({
        where: { OR: [{ ownerId: null }, { ownerId: req.user.id }] },
        orderBy: { name: 'asc' },
      }),
      prisma.workoutSession.findMany({
        where: { ownerId: req.user.id, finishedAt: { not: null } },
        include: { exercises: { select: { name: true } } },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
    ]);
    const plan = generateWorkoutSchedule({ config: parsed.data, user: req.user, exercises, history });
    if (plan.error) return res.status(422).json({ error: plan.error });
    return res.json({
      plan,
      exercises: exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        description: exercise.description,
        difficulty: exercise.difficulty,
        instructions: exercise.instructions,
        imageUrl: exercise.imageUrl,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

export async function listWorkoutPlans(req, res, next) {
  try {
    if (req.query.date !== undefined) {
      if (!isRealDate(req.query.date)) return res.status(400).json({ error: 'Date must be a real YYYY-MM-DD date' });
      const date = dateValue(req.query.date);
      const plan = await prisma.workoutPlan.findFirst({
        where: { ownerId: req.user.id, isActive: true, startDate: { lte: date }, endDate: { gte: date } },
        include: planInclude,
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ plan });
    }
    const plans = await prisma.workoutPlan.findMany({
      where: { ownerId: req.user.id },
      include: planInclude,
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return res.json({ plans });
  } catch (error) {
    return next(error);
  }
}

export async function getWorkoutPlan(req, res, next) {
  try {
    const plan = await prisma.workoutPlan.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: planInclude,
    });
    if (!plan) return res.status(404).json({ error: 'Workout plan not found' });
    return res.json({ plan });
  } catch (error) {
    return next(error);
  }
}

export async function saveWorkoutPlan(req, res, next) {
  const parsed = workoutScheduleSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const validExerciseLists = await Promise.all(parsed.data.days.map((day) => (
      validateExerciseOwnership(day.exercises, req.user.id)
    )));
    if (validExerciseLists.some((isValid) => !isValid)) {
      return res.status(400).json({ error: 'Choose valid exercises from your library without duplicates in each day' });
    }
    const plan = await prisma.$transaction(async (transaction) => {
      await transaction.workoutPlan.updateMany({
        where: { ownerId: req.user.id, isActive: true },
        data: { isActive: false },
      });
      return transaction.workoutPlan.create({
        data: {
          ownerId: req.user.id,
          name: parsed.data.name,
          planType: parsed.data.planType,
          goal: parsed.data.goal,
          level: parsed.data.level,
          splitPreference: parsed.data.splitPreference,
          daysPerWeek: parsed.data.daysPerWeek,
          availableMinutes: parsed.data.availableMinutes,
          equipment: parsed.data.equipment,
          startDate: dateValue(parsed.data.startDate),
          endDate: dateValue(parsed.data.endDate),
          isActive: true,
          days: {
            create: parsed.data.days.map((day) => ({
              date: dateValue(day.date),
              dayOfWeek: day.dayOfWeek,
              title: day.title,
              focus: day.focus,
              isRestDay: day.isRestDay,
              status: day.isRestDay ? 'REST' : 'PLANNED',
              estimatedDurationMinutes: day.estimatedDurationMinutes,
              warmup: day.warmup,
              cooldown: day.cooldown,
              phase: day.phase,
              guidance: day.guidance,
              exercises: { create: dbExerciseData(day.exercises) },
            })),
          },
        },
        include: planInclude,
      });
    });
    return res.status(201).json({ plan });
  } catch (error) {
    return next(error);
  }
}

export async function updateWorkoutPlanDay(req, res, next) {
  const parsed = dayUpdateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const plan = await prisma.workoutPlan.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      select: { id: true },
    });
    if (!plan) return res.status(404).json({ error: 'Workout plan not found' });
    const day = await prisma.workoutPlanDay.findFirst({
      where: { id: req.params.dayId, planId: plan.id },
      select: { id: true },
    });
    if (!day) return res.status(404).json({ error: 'Scheduled workout day not found' });
    if (!await validateExerciseOwnership(parsed.data.exercises, req.user.id)) {
      return res.status(400).json({ error: 'Choose valid exercises from your library without duplicates' });
    }
    const { exercises, ...dayFields } = parsed.data;
    await prisma.$transaction(async (transaction) => {
      await transaction.workoutPlanExercise.deleteMany({ where: { dayId: day.id } });
      if (exercises.length) {
        await transaction.workoutPlanExercise.createMany({
          data: dbExerciseData(exercises).map((exercise) => ({ ...exercise, dayId: day.id })),
        });
      }
      await transaction.workoutPlanDay.update({
        where: { id: day.id },
        data: {
          ...dayFields,
          status: dayFields.isRestDay ? 'REST' : 'PLANNED',
        },
      });
    });
    const updatedDay = await prisma.workoutPlanDay.findFirst({
      where: { id: day.id },
      include: planInclude.days.include,
    });
    return res.json({ day: updatedDay });
  } catch (error) {
    return next(error);
  }
}

export async function completeWorkoutPlanDay(req, res, next) {
  try {
    const plan = await prisma.workoutPlan.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      select: { id: true },
    });
    if (!plan) return res.status(404).json({ error: 'Workout plan not found' });
    const day = await prisma.workoutPlanDay.findFirst({
      where: { id: req.params.dayId, planId: plan.id },
      select: { id: true, isRestDay: true, status: true },
    });
    if (!day) return res.status(404).json({ error: 'Scheduled workout day not found' });
    if (day.isRestDay) return res.status(400).json({ error: 'Rest days cannot be marked as completed workouts' });
    if (day.status === 'COMPLETED') return res.status(409).json({ error: 'This scheduled workout is already completed' });
    const updatedDay = await prisma.workoutPlanDay.update({
      where: { id: day.id },
      data: { status: 'COMPLETED' },
    });
    return res.json({ day: updatedDay });
  } catch (error) {
    return next(error);
  }
}

export async function deleteWorkoutPlan(req, res, next) {
  try {
    const deleted = await prisma.workoutPlan.deleteMany({
      where: { id: req.params.id, ownerId: req.user.id },
    });
    if (!deleted.count) return res.status(404).json({ error: 'Workout plan not found' });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}
