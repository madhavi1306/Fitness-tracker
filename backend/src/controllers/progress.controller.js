import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { estimateNutritionTargets, summarizeFoodLogs } from '../services/nutrition.service.js';
import {
  calculateStreaks,
  filterWorkoutsByRange,
  getExerciseRecords,
  getMuscleGroupVolumes,
  getRangeStart,
  getWeekdayVolumes,
  progressRanges,
  summarizeWorkouts,
} from '../services/progress.service.js';

const rangeSchema = z.enum(progressRanges).default('thisWeek');
const isRealCalendarDate = (value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const weightSchema = z.object({
  weightKg: z.coerce.number().finite().min(20).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealCalendarDate, 'Enter a real calendar date')
    .optional(),
}).strict();

const sessionInclude = {
  exercises: { include: { sets: { where: { completed: true }, orderBy: { setNumber: 'asc' } } } },
};

function getRange(req, res) {
  const parsed = rangeSchema.safeParse(req.query.range || 'thisWeek');
  if (!parsed.success) {
    res.status(400).json({ error: 'Range must be thisWeek, thisMonth, last30Days, or allTime' });
    return null;
  }
  return parsed.data;
}

async function loadWorkouts(ownerId) {
  return prisma.workoutSession.findMany({
    where: { ownerId, finishedAt: { not: null } },
    include: sessionInclude,
    orderBy: { startedAt: 'desc' },
  });
}

async function loadUserRecords(ownerId) {
  return prisma.personalRecord.findMany({
    where: { ownerId },
    orderBy: { achievedAt: 'desc' },
  });
}

function createDashboardPayload(workouts, records, range, weightEntries) {
  const filtered = filterWorkoutsByRange(workouts, range);
  const summary = summarizeWorkouts(filtered);
  const streaks = calculateStreaks(workouts);
  const recent = filtered.slice(0, 3).map((workout) => ({
    id: workout.id,
    name: workout.name,
    startedAt: workout.startedAt,
    durationSeconds: workout.durationSeconds || 0,
    volumeKg: summarizeWorkouts([workout]).volumeKg,
  }));
  const rangeStart = getRangeStart(range);
  const rangedRecords = records.filter((record) => !rangeStart || new Date(record.achievedAt) >= rangeStart);
  const recentRecords = rangedRecords.slice(0, 3);
  return {
    range,
    stats: { ...summary, ...streaks, totalPRs: rangedRecords.length },
    recentWorkouts: recent,
    recentRecords,
    weeklySummary: buildWeeklySummary(workouts, records, weightEntries),
  };
}

function buildWeeklySummary(workouts, records, weightEntries = [], timezoneOffsetMinutes) {
  const now = new Date();
  const weekWorkouts = filterWorkoutsByRange(workouts, 'thisWeek', now, timezoneOffsetMinutes);
  const summary = summarizeWorkouts(weekWorkouts);
  const start = getRangeStart('thisWeek', now, timezoneOffsetMinutes);
  const startDate = start && timezoneOffsetMinutes !== undefined
    ? new Date(start.getTime() - timezoneOffsetMinutes * 60000).toISOString().slice(0, 10)
    : null;
  const weekRecords = records.filter((record) => !start || new Date(record.achievedAt) >= start);
  const improvements = [];
  const recordsByExercise = getExerciseRecords(workouts).reduce((group, entry) => {
    (group[entry.exerciseName] ||= []).push(entry);
    return group;
  }, {});
  for (const [exerciseName, entries] of Object.entries(recordsByExercise)) {
    const thisWeek = entries.filter((entry) => new Date(
      new Date(entry.date).getTime() - (timezoneOffsetMinutes || 0) * 60000,
    ) >= start);
    const prior = entries.filter((entry) => new Date(
      new Date(entry.date).getTime() - (timezoneOffsetMinutes || 0) * 60000,
    ) < start);
    const currentBest = Math.max(0, ...thisWeek.map((entry) => entry.estimatedOneRepMaxKg));
    const priorBest = Math.max(0, ...prior.map((entry) => entry.estimatedOneRepMaxKg));
    if (currentBest > priorBest) {
      improvements.push({ exerciseName, improvementKg: currentBest - priorBest });
    }
  }
  const days = new Set(weekWorkouts.map((workout) => timezoneOffsetMinutes === undefined
    ? new Date(workout.startedAt).toDateString()
    : new Date(workout.startedAt.getTime() - timezoneOffsetMinutes * 60000).toISOString().slice(0, 10)));
  const localNow = timezoneOffsetMinutes === undefined
    ? now
    : new Date(now.getTime() - timezoneOffsetMinutes * 60000);
  const elapsedDays = timezoneOffsetMinutes === undefined
    ? (localNow.getDay() + 6) % 7 + 1
    : (localNow.getUTCDay() + 6) % 7 + 1;
  const thisWeekWeights = weightEntries.filter((entry) => !startDate || entry.date.toISOString().slice(0, 10) >= startDate);
  const previousWeight = weightEntries.filter((entry) => startDate && entry.date.toISOString().slice(0, 10) < startDate).slice(-1)[0];
  const currentWeight = thisWeekWeights[thisWeekWeights.length - 1];
  return {
    workoutsCompleted: summary.workouts,
    volumeKg: summary.volumeKg,
    bestExerciseImprovement: improvements.sort((a, b) => b.improvementKg - a.improvementKg)[0] || null,
    prs: weekRecords,
    weightChangeKg: currentWeight && previousWeight ? currentWeight.weightKg - previousWeight.weightKg : 0,
    consistencyPercent: Math.round(days.size / elapsedDays * 100),
  };
}

function addCalendarDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function summarizePlannedWorkouts(plans, timezoneOffsetMinutes, now = new Date()) {
  const today = new Date(now.getTime() - timezoneOffsetMinutes * 60000).toISOString().slice(0, 10);
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const monday = addCalendarDays(today, -((weekday + 6) % 7));
  const sunday = addCalendarDays(monday, 6);
  const days = plans.flatMap((plan) => plan.days || [])
    .filter((day) => {
      const date = day.date instanceof Date ? day.date.toISOString().slice(0, 10) : String(day.date).slice(0, 10);
      return date >= monday && date <= sunday && !day.isRestDay && (date <= today || day.status === 'COMPLETED');
    });
  const completed = days.filter((day) => day.status === 'COMPLETED').length;
  return {
    plannedWorkouts: days.length,
    completedPlannedWorkouts: completed,
    adherencePercent: days.length ? Math.round(completed / days.length * 100) : 0,
  };
}

export async function getDashboard(req, res, next) {
  const range = getRange(req, res);
  if (!range) return;
  try {
    const [workouts, records, weightEntries] = await Promise.all([
      loadWorkouts(req.user.id),
      loadUserRecords(req.user.id),
      prisma.weightEntry.findMany({ where: { ownerId: req.user.id }, orderBy: { date: 'asc' } }),
    ]);
    return res.json(createDashboardPayload(workouts, records, range, weightEntries));
  } catch (error) {
    return next(error);
  }
}

export async function getWeeklyVolume(req, res, next) {
  const range = getRange(req, res);
  if (!range) return;
  try {
    const workouts = filterWorkoutsByRange(await loadWorkouts(req.user.id), range);
    return res.json({ range, days: getWeekdayVolumes(workouts) });
  } catch (error) {
    return next(error);
  }
}

export async function getStrength(req, res, next) {
  const range = getRange(req, res);
  if (!range) return;
  const exerciseName = typeof req.query.exercise === 'string' ? req.query.exercise.trim() : '';
  if (req.query.exercise && (!exerciseName || exerciseName.length > 100)) {
    return res.status(400).json({ error: 'Exercise filter must be a name up to 100 characters' });
  }
  try {
    const allWorkouts = await loadWorkouts(req.user.id);
    const filtered = filterWorkoutsByRange(allWorkouts, range);
    const options = [...new Set(allWorkouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.name)))].sort();
    const selectedExercise = exerciseName || options[0] || null;
    const records = getExerciseRecords(filtered, selectedExercise || undefined).flatMap((record) =>
      record.sets.map((set) => ({
        date: record.date,
        exerciseName: record.exerciseName,
        weightKg: set.weightKg,
        reps: set.reps,
        estimatedOneRepMaxKg: set.weightKg * (1 + set.reps / 30),
      })),
    );
    return res.json({ range, exercises: options, selectedExercise, points: records });
  } catch (error) {
    return next(error);
  }
}

export async function getMuscleSplit(req, res, next) {
  const range = getRange(req, res);
  if (!range) return;
  try {
    const workouts = filterWorkoutsByRange(await loadWorkouts(req.user.id), range);
    return res.json({ range, groups: getMuscleGroupVolumes(workouts) });
  } catch (error) {
    return next(error);
  }
}

export async function getRecords(req, res, next) {
  const range = getRange(req, res);
  if (!range) return;
  try {
    const records = await loadUserRecords(req.user.id);
    const rangeStart = getRangeStart(range);
    return res.json({
      range,
      records: records.filter((record) => !rangeStart || new Date(record.achievedAt) >= rangeStart),
    });
  } catch (error) {
    return next(error);
  }
}

export async function getOverallProgress(req, res, next) {
  const range = getRange(req, res);
  if (!range) return;
  const parsedOffset = z.coerce.number().int().min(-840).max(840).safeParse(req.query.timezoneOffsetMinutes ?? 0);
  if (!parsedOffset.success) return res.status(400).json({ error: 'Timezone offset must be an integer between -840 and 840 minutes' });
  const timezoneOffsetMinutes = parsedOffset.data;
  try {
    const [allWorkouts, allRecords, weightEntries, foodLogs, savedTarget, activePlans] = await Promise.all([
      loadWorkouts(req.user.id),
      loadUserRecords(req.user.id),
      prisma.weightEntry.findMany({ where: { ownerId: req.user.id }, orderBy: { date: 'asc' } }),
      prisma.foodLog.findMany({ where: { ownerId: req.user.id }, orderBy: { loggedAt: 'asc' } }),
      prisma.nutritionTarget.findUnique({ where: { ownerId: req.user.id } }),
      prisma.workoutPlan.findMany({
        where: { ownerId: req.user.id, isActive: true },
        include: { days: { select: { date: true, isRestDay: true, status: true } } },
      }),
    ]);
    const now = new Date();
    const workouts = filterWorkoutsByRange(allWorkouts, range, now, timezoneOffsetMinutes);
    const rangeStart = getRangeStart(range, now, timezoneOffsetMinutes);
    const rangeStartDate = rangeStart
      ? new Date(rangeStart.getTime() - timezoneOffsetMinutes * 60000).toISOString().slice(0, 10)
      : null;
    const selectedFoodLogs = foodLogs.filter((log) => !rangeStart || new Date(log.loggedAt) >= rangeStart);
    const nutritionTotals = summarizeFoodLogs(selectedFoodLogs);
    const nutritionTarget = savedTarget || estimateNutritionTargets(req.user);
    const rangeRecords = allRecords.filter((record) => !rangeStart || new Date(record.achievedAt) >= rangeStart);
    const allWeightHistory = weightEntries.map((entry) => ({ date: entry.date, weightKg: entry.weightKg }));
    const weightHistory = allWeightHistory
      .filter((entry) => !rangeStartDate || entry.date.toISOString().slice(0, 10) >= rangeStartDate)
      .map((entry) => ({ date: entry.date, weightKg: entry.weightKg }));
    const latestWeight = allWeightHistory[allWeightHistory.length - 1]?.weightKg ?? req.user.currentWeightKg;
    const startingWeight = req.user.startingWeightKg ?? allWeightHistory[0]?.weightKg ?? req.user.currentWeightKg;
    const strength = getExerciseRecords(workouts).map((record) => ({
      exerciseName: record.exerciseName,
      muscleGroup: record.muscleGroup,
      date: record.date,
      estimatedOneRepMaxKg: record.estimatedOneRepMaxKg,
      volumeKg: record.volumeKg,
    }));
    return res.json({
      range,
      stats: { ...summarizeWorkouts(workouts), ...calculateStreaks(allWorkouts) },
      nutrition: {
        ...nutritionTotals,
        dailyCaloriesTarget: nutritionTarget.dailyCalories,
        proteinTargetGrams: nutritionTarget.proteinGrams,
        loggedEntries: selectedFoodLogs.length,
      },
      strength,
      records: rangeRecords,
      bodyWeight: {
        startingWeightKg: startingWeight,
        currentWeightKg: latestWeight,
        targetWeightKg: req.user.targetWeightKg,
        changeKg: latestWeight - startingWeight,
        history: weightHistory,
      },
      weeklySummary: {
        ...buildWeeklySummary(allWorkouts, allRecords, weightEntries, timezoneOffsetMinutes),
        ...summarizePlannedWorkouts(activePlans, timezoneOffsetMinutes, now),
      },
      recentWorkouts: workouts.slice(0, 3).map((workout) => ({
        id: workout.id,
        name: workout.name,
        volumeKg: summarizeWorkouts([workout]).volumeKg,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

export async function createWeightEntry(req, res, next) {
  const parsed = weightSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Enter a valid body weight',
      details: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const today = new Date();
    const sourceDate = parsed.data.date
      ? new Date(`${parsed.data.date}T00:00:00.000Z`)
      : new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const date = new Date(Date.UTC(sourceDate.getUTCFullYear(), sourceDate.getUTCMonth(), sourceDate.getUTCDate()));
    const entry = await prisma.weightEntry.upsert({
      where: { ownerId_date: { ownerId: req.user.id, date } },
      create: { ownerId: req.user.id, date, weightKg: parsed.data.weightKg },
      update: { weightKg: parsed.data.weightKg },
    });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { currentWeightKg: parsed.data.weightKg },
    });
    return res.status(201).json({ entry });
  } catch (error) {
    return next(error);
  }
}

export async function getWeightHistory(req, res, next) {
  try {
    const entries = await prisma.weightEntry.findMany({
      where: { ownerId: req.user.id },
      orderBy: { date: 'asc' },
    });
    return res.json({ entries });
  } catch (error) {
    return next(error);
  }
}
