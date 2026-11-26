import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import {
  finishWorkoutSchema,
  startWorkoutSchema,
  templateSchema,
  templateUpdateSchema,
  workoutSetSchema,
} from '../utils/workoutValidation.js';
import { detectNewRecords, setVolume } from '../services/progress.service.js';

const exerciseInclude = {
  exercise: {
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      equipment: true,
      description: true,
      difficulty: true,
      exerciseType: true,
      instructions: true,
      imageUrl: true,
    },
  },
};

const templateInclude = {
  exercises: { include: exerciseInclude, orderBy: { order: 'asc' } },
};

const sessionInclude = {
  exercises: { include: { sets: { orderBy: { setNumber: 'asc' } } }, orderBy: { order: 'asc' } },
};

function invalid(res, parsed) {
  return res.status(400).json({
    error: 'Please check the highlighted fields',
    details: parsed.error.flatten().fieldErrors,
  });
}

async function validateExerciseOwnership(exercises, ownerId) {
  const ids = [...new Set(exercises.map(({ exerciseId }) => exerciseId))];
  if (ids.length !== exercises.length) return false;
  const found = await prisma.exercise.findMany({
    where: { id: { in: ids }, OR: [{ ownerId: null }, { ownerId }] },
    select: { id: true },
  });
  return found.length === ids.length;
}

function templateExerciseData(exercises) {
  return exercises.map((exercise, order) => ({
    exerciseId: exercise.exerciseId,
    order,
    sets: exercise.sets,
    targetReps: exercise.targetReps,
    targetWeightKg: exercise.targetWeightKg ?? null,
    restSeconds: exercise.restSeconds,
    notes: exercise.notes ?? null,
  }));
}

export async function listTemplates(req, res, next) {
  try {
    const templates = await prisma.workoutTemplate.findMany({
      where: { ownerId: req.user.id },
      include: templateInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return res.json({ templates });
  } catch (error) {
    return next(error);
  }
}

export async function getTemplate(req, res, next) {
  try {
    const template = await prisma.workoutTemplate.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: templateInclude,
    });
    if (!template) return res.status(404).json({ error: 'Workout template not found' });
    return res.json({ template });
  } catch (error) {
    return next(error);
  }
}

export async function createTemplate(req, res, next) {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    if (!await validateExerciseOwnership(parsed.data.exercises, req.user.id)) {
      return res.status(400).json({ error: 'Choose valid exercises from your library without duplicates' });
    }
    const template = await prisma.workoutTemplate.create({
      data: {
        name: parsed.data.name,
        notes: parsed.data.notes ?? null,
        ownerId: req.user.id,
        exercises: { create: templateExerciseData(parsed.data.exercises) },
      },
      include: templateInclude,
    });
    return res.status(201).json({ template });
  } catch (error) {
    return next(error);
  }
}

export async function updateTemplate(req, res, next) {
  const parsed = templateUpdateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const existing = await prisma.workoutTemplate.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'Workout template not found' });
    if (parsed.data.exercises && !await validateExerciseOwnership(parsed.data.exercises, req.user.id)) {
      return res.status(400).json({ error: 'Choose valid exercises from your library without duplicates' });
    }
    const template = await prisma.$transaction(async (transaction) => {
      if (parsed.data.exercises) {
        await transaction.workoutTemplateExercise.deleteMany({ where: { templateId: existing.id } });
      }
      return transaction.workoutTemplate.update({
        where: { id: existing.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
          ...(parsed.data.exercises ? { exercises: { create: templateExerciseData(parsed.data.exercises) } } : {}),
        },
        include: templateInclude,
      });
    });
    return res.json({ template });
  } catch (error) {
    return next(error);
  }
}

export async function deleteTemplate(req, res, next) {
  try {
    const deleted = await prisma.workoutTemplate.deleteMany({
      where: { id: req.params.id, ownerId: req.user.id },
    });
    if (!deleted.count) return res.status(404).json({ error: 'Workout template not found' });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

export async function startWorkout(req, res, next) {
  const parsed = startWorkoutSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    if (parsed.data.planDayId) {
      const day = await prisma.workoutPlanDay.findFirst({
        where: { id: parsed.data.planDayId },
        include: {
          plan: { select: { ownerId: true } },
          exercises: {
            orderBy: { order: 'asc' },
            include: { exercise: true },
          },
        },
      });
      if (!day || day.plan.ownerId !== req.user.id) return res.status(404).json({ error: 'Scheduled workout not found' });
      if (day.isRestDay || !day.exercises.length) return res.status(400).json({ error: 'Rest days cannot be started as workouts' });
      const session = await prisma.workoutSession.create({
        data: {
          name: day.title,
          ownerId: req.user.id,
          planDayId: day.id,
          exercises: {
            create: day.exercises.map((item) => ({
              name: item.exercise.name,
              muscleGroup: item.exercise.muscleGroup,
              equipment: item.exercise.equipment,
              description: item.exercise.description,
              difficulty: item.exercise.difficulty,
              exerciseType: item.exercise.exerciseType,
              instructions: item.exercise.instructions,
              imageUrl: item.exercise.imageUrl,
              order: item.order,
              targetSets: item.sets,
              targetReps: item.reps,
              targetWeightKg: null,
              restSeconds: item.restSeconds,
              notes: item.notes,
            })),
          },
        },
        include: sessionInclude,
      });
      return res.status(201).json({ workout: session });
    }
    const template = await prisma.workoutTemplate.findFirst({
      where: { id: parsed.data.templateId, ownerId: req.user.id },
      include: templateInclude,
    });
    if (!template) return res.status(404).json({ error: 'Workout template not found' });
    const session = await prisma.workoutSession.create({
      data: {
        name: template.name,
        ownerId: req.user.id,
        templateId: template.id,
        exercises: {
          create: template.exercises.map((item) => ({
            name: item.exercise.name,
            muscleGroup: item.exercise.muscleGroup,
            equipment: item.exercise.equipment,
            description: item.exercise.description,
            difficulty: item.exercise.difficulty,
            exerciseType: item.exercise.exerciseType,
            instructions: item.exercise.instructions,
            imageUrl: item.exercise.imageUrl,
            order: item.order,
            targetSets: item.sets,
            targetReps: item.targetReps,
            targetWeightKg: item.targetWeightKg,
            restSeconds: item.restSeconds,
            notes: item.notes,
          })),
        },
      },
      include: sessionInclude,
    });
    return res.status(201).json({ workout: session });
  } catch (error) {
    return next(error);
  }
}

export async function logSet(req, res, next) {
  const parsed = workoutSetSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const session = await prisma.workoutSession.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: { exercises: { include: { sets: true } } },
    });
    if (!session) return res.status(404).json({ error: 'Workout not found' });
    if (session.finishedAt) return res.status(409).json({ error: 'This workout is already finished' });
    const exercise = await prisma.workoutExercise.findFirst({
      where: { id: parsed.data.exerciseId, sessionId: session.id },
      select: { id: true, name: true, targetSets: true },
    });
    if (!exercise) return res.status(400).json({ error: 'Exercise does not belong to this workout' });
    if (parsed.data.setNumber > exercise.targetSets) {
      return res.status(400).json({ error: 'Set number exceeds the planned number of sets' });
    }
    const loggedSets = await prisma.workoutSet.count({ where: { workoutExerciseId: exercise.id } });
    if (parsed.data.setNumber !== loggedSets + 1) {
      return res.status(400).json({ error: 'Sets must be logged in order without gaps' });
    }
    const previousWorkouts = await prisma.workoutSession.findMany({
      where: { ownerId: req.user.id, finishedAt: { not: null } },
      include: { exercises: { include: { sets: true } } },
    });
    const set = await prisma.workoutSet.create({
      data: {
        workoutExerciseId: exercise.id,
        setNumber: parsed.data.setNumber,
        reps: parsed.data.reps,
        weightKg: parsed.data.weightKg,
      },
    });
    const previousSets = previousWorkouts
      .flatMap((workout) => workout.exercises)
      .filter((item) => item.name === exercise.name)
      .flatMap((item) => item.sets)
      .filter((item) => item.completed);
    const currentExercise = session.exercises.find((item) => item.id === exercise.id);
    const priorExerciseVolumes = previousWorkouts.flatMap((workout) => workout.exercises
      .filter((item) => item.name === exercise.name)
      .map((item) => item.sets.filter((entry) => entry.completed)
        .reduce((sum, entry) => sum + setVolume(entry.weightKg, entry.reps), 0)));
    const candidates = detectNewRecords({
      set,
      previousSets,
      currentSets: [...currentExercise.sets, set],
      previousExerciseVolumes: priorExerciseVolumes,
    });
    const prs = [];
    for (const candidate of candidates) {
      if (candidate.value <= (candidate.previousValue ?? 0)) continue;
      const record = await prisma.personalRecord.create({
        data: {
          ownerId: req.user.id,
          workoutSessionId: session.id,
          exerciseName: exercise.name,
          ...candidate,
        },
      });
      prs.push(record);
    }
    return res.status(201).json({ set, prs });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'That set has already been logged' });
    }
    return next(error);
  }
}

export async function finishWorkout(req, res, next) {
  const parsed = finishWorkoutSchema.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed);
  try {
    const session = await prisma.workoutSession.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: { exercises: { include: { sets: true } } },
    });
    if (!session) return res.status(404).json({ error: 'Workout not found' });
    if (session.finishedAt) return res.status(409).json({ error: 'This workout is already finished' });
    const completedSets = session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
    if (completedSets === 0) return res.status(400).json({ error: 'Log at least one completed set before finishing' });
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - session.startedAt.getTime()) / 1000));
    const durationSeconds = parsed.data.durationSeconds ?? elapsedSeconds;
    if (durationSeconds > elapsedSeconds + 10) {
      return res.status(400).json({ error: 'Workout duration cannot exceed elapsed time' });
    }
    const workout = await prisma.workoutSession.update({
      where: { id: session.id },
      data: { finishedAt: new Date(), durationSeconds },
      include: sessionInclude,
    });
    if (session.planDayId) {
      await prisma.workoutPlanDay.update({
        where: { id: session.planDayId },
        data: { status: 'COMPLETED' },
      });
    }
    return res.json({ workout });
  } catch (error) {
    return next(error);
  }
}

export async function listWorkoutHistory(req, res, next) {
  try {
    const workouts = await prisma.workoutSession.findMany({
      where: { ownerId: req.user.id, finishedAt: { not: null } },
      include: sessionInclude,
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return res.json({ workouts });
  } catch (error) {
    return next(error);
  }
}

export async function getWorkout(req, res, next) {
  try {
    const workout = await prisma.workoutSession.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: sessionInclude,
    });
    if (!workout) return res.status(404).json({ error: 'Workout not found' });
    return res.json({ workout });
  } catch (error) {
    return next(error);
  }
}
