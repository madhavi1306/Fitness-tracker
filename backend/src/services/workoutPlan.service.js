import { z } from 'zod';

const muscleGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
const difficultyLevels = ['Beginner', 'Intermediate', 'Advanced'];

const planExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  muscleGroup: z.enum(muscleGroups),
  equipment: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(1000),
  instructions: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  difficulty: z.enum(difficultyLevels),
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(100),
  restSeconds: z.number().int().min(0).max(3600),
}).strict();

export const workoutPlanSchema = z.object({
  title: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goal: z.string().trim().min(1).max(120),
  targetMuscles: z.array(z.enum(muscleGroups)).min(1).max(muscleGroups.length),
  level: z.enum(difficultyLevels),
  availableMinutes: z.number().int().min(10).max(120),
  warmupMinutes: z.number().int().min(1).max(15),
  warmup: z.string().trim().min(1).max(300),
  cooldownMinutes: z.number().int().min(1).max(15),
  cooldown: z.string().trim().min(1).max(300),
  estimatedMinutes: z.number().int().min(1).max(180),
  recoveryNote: z.string().trim().max(300).optional(),
  exercises: z.array(planExerciseSchema).min(1).max(12),
}).strict();

const difficultyRank = { Beginner: 0, Intermediate: 1, Advanced: 2 };
const groupNames = [
  { pattern: /\b(chest|push day|push workout)\b/i, group: 'Chest' },
  { pattern: /\b(back|pull day|pull workout)\b/i, group: 'Back' },
  { pattern: /\b(legs?|lower body|leg day)\b/i, group: 'Legs' },
  { pattern: /\b(shoulders?)\b/i, group: 'Shoulders' },
  { pattern: /\b(arms?|biceps|triceps)\b/i, group: 'Arms' },
  { pattern: /\b(core|abs)\b/i, group: 'Core' },
];

function estimateDuration(plan) {
  const activeMinutes = plan.exercises.reduce((total, exercise) => (
    total + exercise.sets * (0.4 + exercise.restSeconds / 60)
  ), 0);
  return Math.ceil(plan.warmupMinutes + activeMinutes + plan.cooldownMinutes);
}

function requestedDifficulty(message, history, context) {
  if (context?.difficulty) return context.difficulty;
  const explicit = message.match(/\b(beginner|intermediate|advanced)\b/i)?.[1];
  if (explicit) return explicit[0].toUpperCase() + explicit.slice(1).toLowerCase();
  const recentSessions = history.filter((session) => (
    Date.now() - new Date(session.startedAt).getTime() < 90 * 24 * 60 * 60 * 1000
  )).length;
  return recentSessions >= 8 ? 'Intermediate' : 'Beginner';
}

function requestedEquipment(message, context) {
  if (context?.equipment?.length) return context.equipment;
  if (/\b(no equipment|without equipment|bodyweight|at home without)\b/i.test(message)) return ['Bodyweight'];
  const equipment = [];
  if (/\b(dumbbells?|weights? at home)\b/i.test(message)) equipment.push('Dumbbells');
  if (/\bbarbell\b/i.test(message)) equipment.push('Barbell');
  if (/\b(machine|machines)\b/i.test(message)) equipment.push('Machine');
  if (/\bcable\b/i.test(message)) equipment.push('Cable');
  if (/\b(resistance bands?|bands)\b/i.test(message)) equipment.push('Resistance Bands');
  return equipment;
}

function requestedMinutes(message, context) {
  if (context?.availableMinutes) return context.availableMinutes;
  const match = message.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i);
  return match ? Math.min(120, Math.max(10, Number(match[1]))) : 45;
}

function requestedGoal(message, user, context) {
  if (context?.goal) {
    const labels = {
      WEIGHT_GAIN: 'Weight gain',
      WEIGHT_LOSS: 'Fat loss',
      MAINTAIN_WEIGHT: 'General fitness',
      BUILD_STRENGTH: 'Build strength',
    };
    return labels[context.goal];
  }
  if (/\b(gain muscle|build muscle|strength|get stronger)\b/i.test(message)) return 'Build strength';
  if (/\b(lose fat|lose weight|fat loss)\b/i.test(message)) return 'Fat loss';
  if (/\b(gain weight|weight gain)\b/i.test(message)) return 'Weight gain';
  const labels = {
    WEIGHT_GAIN: 'Weight gain',
    WEIGHT_LOSS: 'Fat loss',
    MAINTAIN_WEIGHT: 'General fitness',
    BUILD_STRENGTH: 'Build strength',
  };
  return labels[user.fitnessGoal] || 'General fitness';
}

function requestedGroups(message, context) {
  if (context?.muscleGroup) return [context.muscleGroup];
  const found = groupNames.filter(({ pattern }) => pattern.test(message)).map(({ group }) => group);
  if (found.length) return [...new Set(found)];
  return ['Legs', 'Chest', 'Back', 'Core', 'Shoulders', 'Arms'];
}

function exerciseFromLibrary(exercise, level, sets, reps, restSeconds) {
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    equipment: exercise.equipment,
    description: exercise.description,
    instructions: exercise.instructions,
    difficulty: exercise.difficulty,
    sets,
    reps,
    restSeconds,
  };
}

function wordsToNumber(value) {
  const values = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  return values[value?.toLowerCase()] || Number(value);
}

function resolvePlanExercises(plan, library) {
  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  const resolved = plan.exercises.map((item) => {
    const exercise = byId.get(item.exerciseId);
    if (!exercise) return null;
    return exerciseFromLibrary(exercise, plan.level, item.sets, item.reps, item.restSeconds);
  });
  return resolved.every(Boolean) ? resolved : null;
}

function exerciseWords(value) {
  return value.toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b([a-z]+)s\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function exerciseNameMatches(name, requested) {
  const left = exerciseWords(name);
  const right = exerciseWords(requested);
  return Boolean(right) && (left.includes(right) || right.includes(left));
}

export function generateWorkoutPlan({ message, user, exercises, history = [], date, avoidExerciseIds = [], context }) {
  const minutes = requestedMinutes(message, context);
  const level = requestedDifficulty(message, history, context);
  const groups = requestedGroups(message, context);
  const equipment = requestedEquipment(message, context);
  const recentNames = new Set(history
    .filter((session) => Date.now() - new Date(session.startedAt).getTime() < 7 * 24 * 60 * 60 * 1000)
    .flatMap((session) => session.exercises.map((exercise) => exercise.name.toLowerCase())));
  const recentlyWorkedGroups = new Set(history
    .filter((session) => Date.now() - new Date(session.startedAt).getTime() < 48 * 60 * 60 * 1000)
    .flatMap((session) => session.exercises.map((exercise) => exercise.muscleGroup)));
  const trainingGroups = groups.filter((group) => !recentlyWorkedGroups.has(group));
  if (!trainingGroups.length) return null;
  const recoveryGroups = groups.filter((group) => recentlyWorkedGroups.has(group));
  const avoid = new Set(avoidExerciseIds);
  let candidates = exercises.filter((exercise) => (
    trainingGroups.includes(exercise.muscleGroup)
    && (!equipment.length || equipment.includes(exercise.equipment))
    && difficultyRank[exercise.difficulty] <= difficultyRank[level]
    && !avoid.has(exercise.id)
  ));
  if (candidates.length < 2 && avoid.size) {
    candidates = exercises.filter((exercise) => (
      trainingGroups.includes(exercise.muscleGroup)
      && (!equipment.length || equipment.includes(exercise.equipment))
      && difficultyRank[exercise.difficulty] <= difficultyRank[level]
    ));
  }
  if (!candidates.length) return null;

  const warmupMinutes = minutes < 15 ? 2 : 5;
  const cooldownMinutes = minutes < 15 ? 2 : 5;
  const sets = minutes < 15 ? 1 : level === 'Beginner' ? 2 : 3;
  const reps = level === 'Advanced' ? 8 : 10;
  const restSeconds = minutes < 15 ? 30 : level === 'Advanced' ? 75 : 60;
  const minutesPerExercise = sets * (0.4 + restSeconds / 60);
  const exerciseLimit = Math.min(6, Math.max(1, Math.floor((minutes - warmupMinutes - cooldownMinutes) / minutesPerExercise)));
  const selected = [];
  const usedIds = new Set();
  const orderedGroups = [...groups];
  while (selected.length < exerciseLimit && usedIds.size < candidates.length) {
    let added = false;
    for (const group of orderedGroups) {
      if (selected.length >= exerciseLimit) break;
      const next = candidates
        .filter((exercise) => exercise.muscleGroup === group && !usedIds.has(exercise.id))
        .sort((left, right) => Number(recentNames.has(left.name.toLowerCase())) - Number(recentNames.has(right.name.toLowerCase())))[0];
      if (next) {
        selected.push(next);
        usedIds.add(next.id);
        added = true;
      }
    }
    if (!added) break;
  }
  if (!selected.length) return null;

  const focus = trainingGroups.length === 1 ? trainingGroups[0] : 'Full Body';
  const goal = requestedGoal(message, user, context);
  const plan = {
    title: `${focus} Workout`,
    date,
    goal,
    targetMuscles: [...new Set(selected.map((exercise) => exercise.muscleGroup))],
    level,
    availableMinutes: minutes,
    warmupMinutes,
    warmup: 'Walk briskly or march in place, then use comfortable dynamic movements for the target muscles.',
    cooldownMinutes,
    cooldown: 'Walk slowly and use gentle, comfortable stretches for the muscles you trained.',
    estimatedMinutes: 10,
    ...(recoveryGroups.length ? {
      recoveryNote: `To allow recovery, this plan avoids muscle groups trained in the last 48 hours: ${recoveryGroups.join(', ')}.`,
    } : {}),
    exercises: selected.map((exercise) => exerciseFromLibrary(exercise, level, sets, reps, restSeconds)),
  };
  plan.estimatedMinutes = estimateDuration(plan);
  return workoutPlanSchema.parse(plan);
}

export function editWorkoutPlan({ currentPlan, instruction, exercises }) {
  const parsedPlan = workoutPlanSchema.safeParse(currentPlan);
  if (!parsedPlan.success) return { error: 'I could not validate the current workout plan. Please create it again.' };
  const plan = parsedPlan.data;
  const resolved = resolvePlanExercises(plan, exercises);
  if (!resolved) return { error: 'An exercise in this plan is no longer available in your library. Please create a new plan.' };
  plan.exercises = resolved;
  const text = instruction.toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();

  if (/\b(how long|what is the duration|duration|total time)\b/.test(text)) {
    plan.estimatedMinutes = estimateDuration(plan);
    return { plan, response: `This workout should take about ${plan.estimatedMinutes} minutes, including warm-up and cool-down.` };
  }

  const minutesMatch = text.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/);
  if (minutesMatch) {
    plan.availableMinutes = Math.min(120, Math.max(10, Number(minutesMatch[1])));
    while (plan.exercises.length > 1 && estimateDuration(plan) > plan.availableMinutes) plan.exercises.pop();
    if (estimateDuration(plan) > plan.availableMinutes) {
      plan.exercises = plan.exercises.map((exercise) => ({ ...exercise, sets: 1, restSeconds: Math.min(30, exercise.restSeconds) }));
    }
    plan.estimatedMinutes = estimateDuration(plan);
    return { plan, response: `I adjusted the plan to about ${plan.estimatedMinutes} minutes. Review the updated exercises before saving.` };
  }

  const setChange = text.match(/\b(?:change|set)\s+(.+?)\s+(?:to\s+)?(\d{1,2})\s+sets?\b/)
    || text.match(/\b(.+?)\s+(?:to\s+)?(\d{1,2})\s+sets?\b/);
  if (setChange) {
    const exerciseName = setChange[1].replace(/^(?:change|set)\s+/, '').trim();
    const sets = Math.min(20, Math.max(1, Number(setChange[2])));
    const index = plan.exercises.findIndex((exercise) => exerciseNameMatches(exercise.name, exerciseName));
    if (index >= 0) {
      plan.exercises[index].sets = sets;
      plan.estimatedMinutes = estimateDuration(plan);
      return { plan, response: `I changed ${plan.exercises[index].name} to ${sets} sets. Review the plan before saving.` };
    }
  }

  const repChange = text.match(/\b(?:change|set)\s+(.+?)\s+(?:to\s+)?(\d{1,3})\s+reps?\b/)
    || text.match(/\b(.+?)\s+(?:to\s+)?(\d{1,3})\s+reps?\b/);
  if (repChange) {
    const exerciseName = repChange[1].replace(/^(?:change|set)\s+/, '').trim();
    const reps = Math.min(100, Math.max(1, Number(repChange[2])));
    const index = plan.exercises.findIndex((exercise) => exerciseNameMatches(exercise.name, exerciseName));
    if (index >= 0) {
      plan.exercises[index].reps = reps;
      plan.estimatedMinutes = estimateDuration(plan);
      return { plan, response: `I changed ${plan.exercises[index].name} to ${reps} reps. Review the plan before saving.` };
    }
  }

  const addExerciseMatch = text.match(/\badd\s+(?!\w+\s+more\s+exercises?\b)(.+?)\s+to\s+(?:my\s+)?(?:workout|plan)\b/);
  if (addExerciseMatch) {
    const requestedName = addExerciseMatch[1].replace(/^(?:the|an?|exercise)\s+/, '').trim();
    const exercise = exercises.find((item) => exerciseNameMatches(item.name, requestedName));
    if (!exercise) return { error: `I could not find ${requestedName} in your exercise library.` };
    if (plan.exercises.some((item) => item.exerciseId === exercise.id)) {
      return { error: `${exercise.name} is already in this workout plan.` };
    }
    if (plan.exercises.length >= 12) return { error: 'This workout already has the maximum of 12 exercises.' };
    const similarExercise = plan.exercises.find((item) => item.muscleGroup === exercise.muscleGroup);
    plan.exercises.push(exerciseFromLibrary(
      exercise,
      plan.level,
      similarExercise?.sets ?? (plan.level === 'Beginner' ? 2 : 3),
      similarExercise?.reps ?? 10,
      similarExercise?.restSeconds ?? 60,
    ));
    plan.targetMuscles = [...new Set(plan.exercises.map((item) => item.muscleGroup))];
    plan.estimatedMinutes = estimateDuration(plan);
    return { plan, response: `I added ${exercise.name} to the workout. Review the updated plan before saving.` };
  }

  if (/\b(easier|make it easy|reduce intensity|less intense)\b/.test(text)) {
    plan.level = 'Beginner';
    plan.exercises = plan.exercises.map((exercise) => ({
      ...exercise,
      sets: Math.max(1, Math.min(2, exercise.sets - 1)),
      reps: Math.max(6, exercise.reps - 2),
      restSeconds: Math.max(60, exercise.restSeconds),
    }));
    plan.estimatedMinutes = estimateDuration(plan);
    return { plan, response: 'I made the workout easier with fewer sets and controlled repetitions. Review the plan before saving.' };
  }

  const removeMatch = text.match(/\bremove\b(?:\s+(?:the|my|exercise))?\s+(.+?)(?:\s+exercise)?$/);
  const ordinalMatch = text.match(/\bremove\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th)\s+exercise\b/);
  if (removeMatch || ordinalMatch) {
    const ordinal = ordinalMatch
      ? ({ first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3 })[ordinalMatch[1]]
      : -1;
    const index = ordinal >= 0
      ? ordinal
      : plan.exercises.findIndex((exercise) => exerciseNameMatches(exercise.name, removeMatch[1]));
    if (index < 0 || index >= plan.exercises.length) return { error: 'I could not find that exercise in the current plan.' };
    if (plan.exercises.length === 1) return { error: 'A workout needs at least one exercise. Replace this exercise instead.' };
    const [removed] = plan.exercises.splice(index, 1);
    plan.targetMuscles = [...new Set(plan.exercises.map((exercise) => exercise.muscleGroup))];
    plan.estimatedMinutes = estimateDuration(plan);
    return { plan, response: `I removed ${removed.name}. The updated plan is ready to review.` };
  }

  const replaceMatch = text.match(/\breplace\b(?:\s+(?:the|my|exercise))?\s+(.+?)(?:\s+with\s+(.+))?$/)
    || text.match(/\b(?:cannot|can't|can not|unable to)\s+do\s+(.+?)(?:\s+exercise)?$/);
  const ordinalReplace = text.match(/\breplace\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th)\s+exercise\b/);
  if (replaceMatch || ordinalReplace) {
    const ordinal = ordinalReplace
      ? ({ first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3 })[ordinalReplace[1]]
      : -1;
    const requested = replaceMatch?.[1]?.trim();
    const index = ordinal >= 0
      ? ordinal
      : plan.exercises.findIndex((exercise) => exerciseNameMatches(exercise.name, requested));
    if (index < 0 || index >= plan.exercises.length) return { error: 'I could not find that exercise in the current plan.' };
    const current = plan.exercises[index];
    const requestedAlternative = replaceMatch?.[2]?.trim();
    let replacement = requestedAlternative
      ? exercises.find((exercise) => exerciseNameMatches(exercise.name, requestedAlternative)
        && exercise.muscleGroup === current.muscleGroup
        && !plan.exercises.some((item) => item.exerciseId === exercise.id))
      : null;
    if (!replacement) {
      replacement = exercises.find((exercise) => exercise.muscleGroup === current.muscleGroup
        && exercise.equipment === current.equipment
        && !plan.exercises.some((item) => item.exerciseId === exercise.id));
    }
    if (!replacement) {
      replacement = exercises.find((exercise) => exercise.muscleGroup === current.muscleGroup
        && !plan.exercises.some((item) => item.exerciseId === exercise.id));
    }
    if (!replacement) return { error: `I could not find a suitable alternative for ${current.name} in your exercise library.` };
    plan.exercises[index] = exerciseFromLibrary(replacement, plan.level, current.sets, current.reps, current.restSeconds);
    plan.targetMuscles = [...new Set(plan.exercises.map((exercise) => exercise.muscleGroup))];
    plan.estimatedMinutes = estimateDuration(plan);
    return {
      plan,
      response: `I replaced ${current.name} with ${replacement.name}. Review the updated plan before saving.`,
    };
  }

  const addMatch = text.match(/\badd\s+(\w+)\s+more\s+exercises?\b/);
  if (addMatch) {
    const count = Math.min(4, Math.max(1, wordsToNumber(addMatch[1])));
    if (!Number.isFinite(count)) return { error: 'Tell me how many exercises to add, from one to four.' };
    const equipment = [...new Set(plan.exercises.map((exercise) => exercise.equipment))];
    const available = exercises.filter((exercise) => (
      plan.targetMuscles.includes(exercise.muscleGroup)
      && equipment.includes(exercise.equipment)
      && !plan.exercises.some((item) => item.exerciseId === exercise.id)
      && difficultyRank[exercise.difficulty] <= difficultyRank[plan.level]
    ));
    const additions = available.slice(0, count).map((exercise) => (
      exerciseFromLibrary(exercise, plan.level, plan.level === 'Beginner' ? 2 : 3, 10, 60)
    ));
    if (!additions.length) return { error: 'I could not find more matching exercises in your library.' };
    plan.exercises.push(...additions);
    plan.targetMuscles = [...new Set(plan.exercises.map((exercise) => exercise.muscleGroup))];
    plan.estimatedMinutes = estimateDuration(plan);
    return { plan, response: `I added ${additions.map((exercise) => exercise.name).join(' and ')}. Review the updated plan before saving.` };
  }

  return null;
}
