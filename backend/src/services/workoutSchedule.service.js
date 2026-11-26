import { z } from 'zod';
import { equipmentTypes } from '../utils/workoutValidation.js';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const difficultyLevels = ['Beginner', 'Intermediate', 'Advanced'];
const difficultyRank = { Beginner: 0, Intermediate: 1, Advanced: 2 };
const muscleGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a real calendar date');

const exerciseSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(100),
  restSeconds: z.number().int().min(0).max(3600),
  notes: z.string().max(500).nullable().optional(),
}).strict();

const daySchema = z.object({
  date: dateSchema,
  dayOfWeek: z.number().int().min(0).max(6),
  title: z.string().trim().min(1).max(100),
  focus: z.string().trim().min(1).max(100),
  isRestDay: z.boolean(),
  estimatedDurationMinutes: z.number().int().min(0).max(240),
  warmup: z.string().max(300),
  cooldown: z.string().max(300),
  phase: z.string().max(50),
  guidance: z.string().max(500),
  exercises: z.array(exerciseSchema).max(12),
}).strict().superRefine((day, context) => {
  if (day.isRestDay && day.exercises.length) {
    context.addIssue({ code: 'custom', message: 'Rest days cannot include exercises', path: ['exercises'] });
  }
  if (!day.isRestDay && !day.exercises.length) {
    context.addIssue({ code: 'custom', message: 'Training days need at least one exercise', path: ['exercises'] });
  }
});

export const workoutScheduleConfigSchema = z.object({
  planType: z.enum(['WEEKLY', 'MONTHLY']),
  startDate: dateSchema.optional(),
  availableDays: z.array(z.number().int().min(0).max(6)).min(1).max(6)
    .refine((days) => new Set(days).size === days.length, 'Choose each training day only once')
    .default([1, 3, 5]),
  level: z.enum(difficultyLevels).default('Beginner'),
  equipment: z.array(z.enum(equipmentTypes)).min(1).max(equipmentTypes.length).default(['Dumbbells', 'Bodyweight'])
    .refine((items) => new Set(items).size === items.length, 'Choose equipment only once'),
  availableMinutes: z.number().int().min(15).max(120).default(45),
  splitPreference: z.enum(['FULL_BODY', 'UPPER_LOWER', 'PUSH_PULL_LEGS']).default('FULL_BODY'),
}).strict().superRefine((config, context) => {
  const maximumDays = config.level === 'Beginner' ? 4 : config.level === 'Intermediate' ? 5 : 6;
  if (config.availableDays.length > maximumDays) {
    context.addIssue({
      code: 'custom',
      message: `${config.level} plans can schedule at most ${maximumDays} training days per week`,
      path: ['availableDays'],
    });
  }
  const sortedDays = [...config.availableDays].sort((left, right) => left - right);
  let longestRun = 0;
  for (let index = 0; index < sortedDays.length; index += 1) {
    let run = 1;
    for (let offset = 1; offset < sortedDays.length; offset += 1) {
      if ((sortedDays[index] + offset) % 7 !== sortedDays[(index + offset) % sortedDays.length]) break;
      run += 1;
    }
    longestRun = Math.max(longestRun, run);
  }
  const maximumRun = config.level === 'Beginner' ? 2 : config.level === 'Intermediate' ? 3 : 6;
  if (longestRun > maximumRun) {
    context.addIssue({
      code: 'custom',
      message: `${config.level} schedules need a recovery day after ${maximumRun} consecutive training days`,
      path: ['availableDays'],
    });
  }
});

export const workoutScheduleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  planType: z.enum(['WEEKLY', 'MONTHLY']),
  goal: z.string().trim().min(1).max(80),
  level: z.enum(difficultyLevels),
  splitPreference: z.enum(['FULL_BODY', 'UPPER_LOWER', 'PUSH_PULL_LEGS']),
  daysPerWeek: z.number().int().min(1).max(6),
  availableMinutes: z.number().int().min(15).max(120),
  equipment: z.array(z.enum(equipmentTypes)).min(1).max(equipmentTypes.length),
  startDate: dateSchema,
  endDate: dateSchema,
  days: z.array(daySchema).min(7).max(31),
}).strict().superRefine((plan, context) => {
  const expectedDays = plan.planType === 'WEEKLY'
    ? 7
    : new Date(Date.UTC(
      Number(plan.startDate.slice(0, 4)),
      Number(plan.startDate.slice(5, 7)),
      0,
    )).getUTCDate();
  if (plan.days.length !== expectedDays) {
    context.addIssue({ code: 'custom', message: 'The schedule must include every date in its period', path: ['days'] });
  }
  if (plan.days[0]?.date !== plan.startDate || plan.days.at(-1)?.date !== plan.endDate) {
    context.addIssue({ code: 'custom', message: 'Schedule dates must match the selected period', path: ['days'] });
  }
  for (let index = 0; index < plan.days.length; index += 1) {
    const day = plan.days[index];
    const expectedDate = addDays(plan.startDate, index);
    if (day.date !== expectedDate || day.dayOfWeek !== new Date(`${day.date}T00:00:00.000Z`).getUTCDay()) {
      context.addIssue({ code: 'custom', message: 'Schedule dates must be consecutive and have matching weekdays', path: ['days', index] });
    }
  }
});

function addDays(date, amount) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

function mondayOf(date) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

function rangeFor(config) {
  if (config.planType === 'WEEKLY') {
    const startDate = mondayOf(config.startDate);
    return { startDate, dayCount: 7 };
  }
  const startDate = `${config.startDate.slice(0, 7)}-01`;
  const dayCount = new Date(Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)),
    0,
  )).getUTCDate();
  return { startDate, dayCount };
}

function goalLabel(goal) {
  return {
    WEIGHT_GAIN: 'Weight gain',
    WEIGHT_LOSS: 'Weight loss',
    MAINTAIN_WEIGHT: 'General fitness',
    BUILD_STRENGTH: 'Build strength',
  }[goal] || 'General fitness';
}

function splitFor(preference, trainingCount, index) {
  if (preference === 'UPPER_LOWER' && trainingCount >= 2) {
    const upper = index % 2 === 0;
    return upper
      ? { title: 'Upper Body', focus: 'Upper Body', groups: ['Chest', 'Back', 'Shoulders', 'Arms'] }
      : { title: 'Lower Body', focus: 'Lower Body', groups: ['Legs', 'Core'] };
  }
  if (preference === 'PUSH_PULL_LEGS' && trainingCount >= 3) {
    const patterns = [
      { title: 'Push Day', focus: 'Push', groups: ['Chest', 'Shoulders', 'Arms'] },
      { title: 'Pull Day', focus: 'Pull', groups: ['Back'] },
      { title: 'Leg Day', focus: 'Legs', groups: ['Legs', 'Core'] },
    ];
    return patterns[index % patterns.length];
  }
  return {
    title: `Full Body${trainingCount > 1 ? ` ${String.fromCharCode(65 + (index % 3))}` : ''}`,
    focus: 'Full Body',
    groups: muscleGroups,
  };
}

function dayPhase(planType, weekIndex) {
  if (planType !== 'MONTHLY') return { phase: 'Weekly plan', guidance: 'Use a controlled pace and stop if your form breaks down.' };
  const phases = [
    { phase: 'Foundation', guidance: 'Practice technique and choose comfortable loads.' },
    { phase: 'Build', guidance: 'Progress only if all sets feel controlled; do not increase weight automatically.' },
    { phase: 'Progress', guidance: 'Continue gradually only when recovery and form are good.' },
    { phase: 'Recovery', guidance: 'Reduce each exercise by one set and focus on recovery and technique.' },
  ];
  return phases[Math.min(3, weekIndex)];
}

function setsAndReps(level, goal, weekIndex, planType) {
  const baseSets = level === 'Beginner' ? 2 : 3;
  const sets = planType === 'MONTHLY' && weekIndex >= 3 ? Math.max(1, baseSets - 1) : baseSets;
  if (goal === 'Build strength') return { sets, reps: level === 'Beginner' ? 8 : 6, restSeconds: 120 };
  if (goal === 'Fat loss') return { sets, reps: 12, restSeconds: 60 };
  return { sets, reps: 10, restSeconds: level === 'Advanced' ? 90 : 75 };
}

function exerciseTargets(groups, exercises, equipment, level, history, usedThisWeek, parameters, maxExercises) {
  const eligible = exercises.filter((exercise) => (
    groups.includes(exercise.muscleGroup)
    && equipment.includes(exercise.equipment)
    && difficultyRank[exercise.difficulty] <= difficultyRank[level]
  ));
  const priorNames = new Set(history
    .filter((session) => Date.now() - new Date(session.startedAt).getTime() < 7 * 86400000)
    .flatMap((session) => (session.exercises || []).map((exercise) => exercise.name.toLowerCase())));
  const result = [];
  const groupOrder = groups.filter((group, index) => groups.indexOf(group) === index);
  let ordered = [...groupOrder];
  while (result.length < maxExercises && result.length < eligible.length) {
    let added = false;
    for (const group of ordered) {
      if (result.length >= maxExercises) break;
      const candidates = eligible
        .filter((exercise) => exercise.muscleGroup === group
          && !result.some((item) => item.exerciseId === exercise.id))
        .sort((left, right) => (
          Number(usedThisWeek.has(left.id)) - Number(usedThisWeek.has(right.id))
          || Number(priorNames.has(left.name.toLowerCase())) - Number(priorNames.has(right.name.toLowerCase()))
          || left.name.localeCompare(right.name)
        ));
      if (candidates[0]) {
        result.push({
          exerciseId: candidates[0].id,
          sets: parameters.sets,
          reps: parameters.reps,
          restSeconds: parameters.restSeconds,
          notes: null,
        });
        added = true;
      }
    }
    if (!added) break;
    ordered = groupOrder;
  }
  return result;
}

function estimateDuration(exercises) {
  return 10 + exercises.reduce((sum, exercise) => (
    sum + exercise.sets * 0.7 + Math.max(0, exercise.sets - 1) * exercise.restSeconds / 60
  ), 0);
}

export function generateWorkoutSchedule({ config: input, user, exercises, history = [] }) {
  const config = workoutScheduleConfigSchema.parse(input);
  const { startDate, dayCount } = rangeFor(config);
  const endDate = addDays(startDate, dayCount - 1);
  const eligibleExercises = exercises.filter((exercise) => (
    config.equipment.includes(exercise.equipment)
    && difficultyRank[exercise.difficulty] <= difficultyRank[config.level]
  ));
  if (!eligibleExercises.length) return { error: 'No exercises match the selected equipment and experience level. Choose more equipment or a different level.' };

  const trainingDays = new Set(config.availableDays);
  const numberOfTrainingDays = config.availableDays.length;
  const days = [];
  let trainingIndex = 0;
  let currentWeek = -1;
  let usedThisWeek = new Set();
  for (let index = 0; index < dayCount; index += 1) {
    const date = addDays(startDate, index);
    const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const weekIndex = Math.floor(index / 7);
    if (weekIndex !== currentWeek) {
      currentWeek = weekIndex;
      usedThisWeek = new Set();
    }
    if (!trainingDays.has(dayOfWeek)) {
      days.push({
        date,
        dayOfWeek,
        title: 'Rest Day',
        focus: 'Recovery',
        isRestDay: true,
        estimatedDurationMinutes: 0,
        warmup: '',
        cooldown: '',
        phase: config.planType === 'MONTHLY' ? dayPhase(config.planType, weekIndex).phase : 'Weekly plan',
        guidance: 'Rest, hydrate, and take an easy walk or gentle mobility work if comfortable.',
        exercises: [],
      });
      continue;
    }
    const split = splitFor(config.splitPreference, numberOfTrainingDays, trainingIndex);
    const phase = dayPhase(config.planType, weekIndex);
    const targets = setsAndReps(config.level, goalLabel(user.fitnessGoal), weekIndex, config.planType);
    const minutesPerExercise = targets.sets * 0.7 + Math.max(0, targets.sets - 1) * targets.restSeconds / 60;
    const maxExercises = Math.max(1, Math.min(6, Math.floor((config.availableMinutes - 10) / minutesPerExercise)));
    const selected = exerciseTargets(
      split.groups,
      eligibleExercises,
      config.equipment,
      config.level,
      history,
      usedThisWeek,
      targets,
      maxExercises,
    );
    if (!selected.length) return { error: `No ${split.focus.toLowerCase()} exercises match your equipment and experience in the Exercise Library.` };
    selected.forEach((item) => usedThisWeek.add(item.exerciseId));
    const estimatedDurationMinutes = Math.ceil(estimateDuration(selected));
    const focus = [...new Set(selected.map((item) => exercises.find((exercise) => exercise.id === item.exerciseId)?.muscleGroup))];
    days.push({
      date,
      dayOfWeek,
      title: split.title,
      focus: focus.join(', '),
      isRestDay: false,
      estimatedDurationMinutes,
      warmup: 'Start with 5 minutes of easy movement and controlled dynamic warm-up.',
      cooldown: 'Finish with 5 minutes of easy movement and comfortable stretches.',
      phase: phase.phase,
      guidance: phase.guidance,
      exercises: selected,
    });
    trainingIndex += 1;
  }

  return workoutScheduleSchema.parse({
    name: config.planType === 'WEEKLY' ? 'Weekly Workout Plan' : 'Monthly Workout Plan',
    planType: config.planType,
    goal: goalLabel(user.fitnessGoal),
    level: config.level,
    splitPreference: config.splitPreference,
    daysPerWeek: numberOfTrainingDays,
    availableMinutes: config.availableMinutes,
    equipment: config.equipment,
    startDate,
    endDate,
    days,
  });
}

export const workoutPlanDays = weekdays;
