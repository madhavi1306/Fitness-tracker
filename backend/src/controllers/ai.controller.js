import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { buildMealSuggestions, calculateFoodNutrition, estimateNutritionTargets, summarizeFoodLogs } from '../services/nutrition.service.js';
import { filterWorkoutsByRange, summarizeWorkouts } from '../services/progress.service.js';
import { parseFoodMentions, summarizeFoodMentions, voiceFoodSuggestions, workoutVolume } from '../services/voice.service.js';
import { editWorkoutPlan, generateWorkoutPlan, workoutPlanSchema } from '../services/workoutPlan.service.js';
import {
  dietPlanSchema,
  editDietPlan,
  generateDietPlanWeekWithProvider,
  generateDietPlanWithProvider,
} from '../services/dietPlan.service.js';

const chatSchema = z.object({
  message: z.string().trim().min(1).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  activeWorkoutId: z.string().trim().min(1).max(100).optional(),
  activeExerciseId: z.string().trim().min(1).max(100).optional(),
  activeExerciseName: z.string().trim().min(1).max(100).optional(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional().default(0),
  currentPlan: workoutPlanSchema.optional(),
  currentDietPlan: dietPlanSchema.optional(),
  context: z.object({
    topic: z.enum(['NUTRITION', 'EXERCISE']).optional(),
    goal: z.enum(['WEIGHT_GAIN', 'WEIGHT_LOSS', 'MAINTAIN_WEIGHT', 'BUILD_STRENGTH']).optional(),
    equipment: z.array(z.enum(['Barbell', 'Dumbbells', 'Machine', 'Cable', 'Bodyweight', 'Resistance Bands']))
      .max(6)
      .optional(),
    availableMinutes: z.number().int().min(10).max(120).optional(),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional(),
    muscleGroup: z.enum(['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']).optional(),
  }).strict().optional(),
  allowAI: z.boolean().optional().default(false),
}).strict();

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const round1 = (value) => Math.round(value * 10) / 10;
const pluralFoodNames = {
  egg: 'eggs',
  chapati: 'chapatis',
  banana: 'bananas',
  idli: 'idlis',
  dosa: 'dosas',
  chickpea: 'chickpeas',
};

function foodQuantityLabel(item) {
  const name = item.foodName.toLowerCase();
  const plural = pluralFoodNames[name] || `${name}${name.endsWith('s') ? '' : 's'}`;
  return `${item.quantity} ${item.quantity === 1 ? name : plural}`;
}

function addCalendarDays(date, days) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function localDateBounds(startDate, endDate, timezoneOffsetMinutes) {
  const start = new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() + timezoneOffsetMinutes * 60000);
  const end = new Date(new Date(`${addCalendarDays(endDate, 1)}T00:00:00.000Z`).getTime()
    + timezoneOffsetMinutes * 60000 - 1);
  return { start, end };
}

function dateOnlyBounds(startDate, endDate) {
  return {
    start: new Date(`${startDate}T00:00:00.000Z`),
    end: new Date(`${endDate}T23:59:59.999Z`),
  };
}

function dateBounds(date, timezoneOffsetMinutes = 0) {
  return localDateBounds(date, date, timezoneOffsetMinutes);
}

function invalid(res, parsed) {
  return res.status(400).json({
    error: 'Please enter a valid voice command',
    details: parsed.error.flatten().fieldErrors,
  });
}

function normalized(message) {
  return message.toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey\s+formline|hey|okay|ok|please|can you|could you)\s+)+/, '')
    .replace(/\s+please$/, '');
}

async function getFinishedWorkouts(ownerId) {
  return prisma.workoutSession.findMany({
    where: { ownerId, finishedAt: { not: null } },
    include: { exercises: { include: { sets: true } } },
    orderBy: { startedAt: 'desc' },
  });
}

async function activeWorkout(ownerId, id) {
  const where = { ownerId, finishedAt: null };
  if (id) where.id = id;
  return prisma.workoutSession.findFirst({
    where,
    include: { exercises: { include: { sets: true }, orderBy: { order: 'asc' } } },
    orderBy: { startedAt: 'desc' },
  });
}

async function getVisibleExercises(ownerId) {
  return prisma.exercise.findMany({
    where: { AND: [{ OR: [{ ownerId: null }, { ownerId }] }] },
    orderBy: { name: 'asc' },
    take: 300,
  });
}

function exerciseSearchText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function requestsWorkoutPlan(command) {
  if (/\b(nutrition|diet|meal|food)\s*(plan|plans)\b/.test(command)) return false;
  return /\b(create|make|build|generate|design|plan)\b.*\b(workout|routine|training|plan)\b/.test(command)
    || /\b(create|make|build|generate)\b.*\b(workout )?template\b/.test(command)
    || /\b(full body|beginner|intermediate|advanced|\d+\s*(?:minutes?|mins?))\s+workout\b/.test(command)
    || /\b(i want to train|train my)\s+(chest|back|legs?|shoulders?|arms?|core)\b/.test(command)
    || /^(what workout should i do( today)?|recommend a workout( for today)?|suggest a workout( for today)?)$/.test(command);
}

function isSetCompletionCommand(command) {
  return /^(?:i\s+(?:just\s+)?(?:completed|did|finished|logged)|(?:completed|did|finished|logged))\s+\d{1,4}\s+reps?\b/.test(command);
}

async function getNutritionTarget(user) {
  const stored = await prisma.nutritionTarget.findUnique({ where: { ownerId: user.id } });
  if (stored) return stored;
  const estimate = estimateNutritionTargets(user);
  return prisma.nutritionTarget.upsert({
    where: { ownerId: user.id },
    create: {
      ownerId: user.id,
      maintenanceCalories: estimate.maintenanceCalories,
      dailyCalories: estimate.dailyCalories,
      proteinGrams: estimate.proteinGrams,
      carbohydratesGrams: estimate.carbohydratesGrams,
      fatGrams: estimate.fatGrams,
      isCustom: false,
    },
    update: {},
  });
}

async function getPlanBalance(ownerId, user, plan, timezoneOffsetMinutes) {
  const { start, end } = dateBounds(plan.date, timezoneOffsetMinutes);
  const [logs, target] = await Promise.all([
    prisma.foodLog.findMany({ where: { ownerId, loggedAt: { gte: start, lte: end } } }),
    getNutritionTarget(user),
  ]);
  const consumed = summarizeFoodLogs(logs);
  return {
    dailyCaloriesTarget: target.dailyCalories,
    proteinTargetGrams: target.proteinGrams,
    consumedCalories: consumed.calories,
    consumedProteinGrams: consumed.proteinGrams,
    remainingCalories: round1(target.dailyCalories - consumed.calories - plan.estimatedCalories),
    remainingProteinGrams: round1(target.proteinGrams - consumed.proteinGrams - plan.estimatedProteinGrams),
  };
}

function rangeBounds(dateString, range, timezoneOffsetMinutes = 0) {
  let startDate = dateString;
  if (range === 'week') {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    startDate = addCalendarDays(dateString, -((date.getUTCDay() + 6) % 7));
  } else if (range === 'month') {
    startDate = `${dateString.slice(0, 7)}-01`;
  } else if (range === 'all') {
    startDate = '1970-01-01';
  }
  const bounds = range === 'all'
    ? { start: new Date('1970-01-01T00:00:00.000Z'), end: localDateBounds(dateString, dateString, timezoneOffsetMinutes).end }
    : localDateBounds(startDate, dateString, timezoneOffsetMinutes);
  return { ...bounds, startDate, endDate: dateString };
}

function localDateKey(date, timezoneOffsetMinutes) {
  return new Date(date.getTime() - timezoneOffsetMinutes * 60000).toISOString().slice(0, 10);
}

async function voiceProgressSummary(ownerId, user, date, range, timezoneOffsetMinutes = 0) {
  const { start, end, startDate, endDate } = rangeBounds(date, range, timezoneOffsetMinutes);
  const previousStart = new Date(start);
  const previousEnd = new Date(start.getTime() - 1);
  if (range === 'week') previousStart.setUTCDate(previousStart.getUTCDate() - 7);
  if (range === 'month') previousStart.setUTCMonth(previousStart.getUTCMonth() - 1);
  if (range === 'day') previousStart.setUTCDate(previousStart.getUTCDate() - 1);

  const [workouts, previousWorkouts, foodLogs, previousFoodLogs, weightEntries, target, records] = await Promise.all([
    prisma.workoutSession.findMany({
      where: { ownerId, finishedAt: { not: null }, startedAt: { gte: start, lte: end } },
      include: { exercises: { include: { sets: { where: { completed: true } } } } },
      orderBy: { startedAt: 'asc' },
    }),
    range === 'day' ? Promise.resolve([]) : prisma.workoutSession.findMany({
      where: { ownerId, finishedAt: { not: null }, startedAt: { gte: previousStart, lte: previousEnd } },
      include: { exercises: { include: { sets: { where: { completed: true } } } } },
    }),
    prisma.foodLog.findMany({
      where: { ownerId, loggedAt: { gte: start, lte: end } },
      orderBy: { loggedAt: 'asc' },
    }),
    prisma.foodLog.findMany({
      where: { ownerId, loggedAt: { gte: previousStart, lte: previousEnd } },
      orderBy: { loggedAt: 'asc' },
    }),
    prisma.weightEntry.findMany({
      where: {
        ownerId,
        date: { gte: dateOnlyBounds(startDate, endDate).start, lte: dateOnlyBounds(startDate, endDate).end },
      },
      orderBy: { date: 'asc' },
    }),
    getNutritionTarget(user),
    prisma.personalRecord.findMany({
      where: { ownerId, achievedAt: { gte: start, lte: end } },
      orderBy: { achievedAt: 'desc' },
      take: 10,
    }),
  ]);
  const totals = summarizeWorkouts(workouts);
  const previousTotals = summarizeWorkouts(previousWorkouts);
  const nutrition = summarizeFoodLogs(foodLogs);
  const previousNutrition = summarizeFoodLogs(previousFoodLogs);
  const caloriesByDay = foodLogs.reduce((days, log) => {
    const key = localDateKey(log.loggedAt, timezoneOffsetMinutes);
    days[key] = (days[key] || 0) + log.calories;
    return days;
  }, {});
  const proteinByDay = foodLogs.reduce((days, log) => {
    const key = localDateKey(log.loggedAt, timezoneOffsetMinutes);
    days[key] = (days[key] || 0) + log.proteinGrams;
    return days;
  }, {});
  const activityByDay = workouts.reduce((days, workout) => {
    const key = localDateKey(workout.startedAt, timezoneOffsetMinutes);
    days[key] ||= { workouts: 0, sets: 0, volumeKg: 0 };
    days[key].workouts += 1;
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        if (!set.completed) continue;
        days[key].sets += 1;
        days[key].volumeKg += set.weightKg * set.reps;
      }
    }
    return days;
  }, {});
  const elapsedDays = range === 'day'
    ? 1
    : Math.max(1, Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86400000,
    ) + 1);
  return {
    range,
    period: { start: startDate, end: endDate },
    workouts: {
      completed: totals.workouts,
      previousCompleted: previousTotals.workouts,
      durationSeconds: totals.durationSeconds,
      previousDurationSeconds: previousTotals.durationSeconds,
      sets: totals.sets,
      reps: totals.reps,
      volumeKg: round1(totals.volumeKg),
      activityByDay: Object.entries(activityByDay).map(([day, activity]) => ({ day, ...activity })),
      previousVolumeKg: round1(previousTotals.volumeKg),
    },
    nutrition: {
      calories: round1(nutrition.calories),
      previousCalories: round1(previousNutrition.calories),
      proteinGrams: round1(nutrition.proteinGrams),
      previousProteinGrams: round1(previousNutrition.proteinGrams),
      averageDailyCalories: round1(nutrition.calories / elapsedDays),
      averageDailyProteinGrams: round1(nutrition.proteinGrams / elapsedDays),
      dailyCaloriesTarget: target.dailyCalories,
      proteinTargetGrams: target.proteinGrams,
      caloriesTargetForPeriod: round1(target.dailyCalories * elapsedDays),
      proteinTargetForPeriod: round1(target.proteinGrams * elapsedDays),
      caloriesByDay,
      proteinByDay,
    },
    weight: {
      entries: weightEntries.map((entry) => ({ date: entry.date.toISOString().slice(0, 10), weightKg: entry.weightKg })),
      changeKg: weightEntries.length > 1
        ? round1(weightEntries[weightEntries.length - 1].weightKg - weightEntries[0].weightKg)
        : null,
    },
    records,
  };
}

async function optionalAIReply(message) {
  const { AI_ENABLED, AI_API_URL, AI_API_KEY, AI_MODEL } = process.env;
  if (AI_ENABLED !== 'true' || !AI_API_URL || !AI_API_KEY || !AI_MODEL) {
    return {
      response: 'Conversational AI is not configured on the server. Supported offline commands are still available.',
      aiStatus: 'not_configured',
    };
  }

  try {
    const providerResponse = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: 'Answer general fitness questions briefly and safely. You cannot access this user’s account or perform actions. Do not provide medical advice, extreme diets, or instructions to alter account data.' },
          { role: 'user', content: message },
        ],
        max_tokens: 180,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!providerResponse.ok) {
      return {
        response: 'The configured AI provider could not answer right now. Try an offline command such as “show my progress” or “open my diet.”',
        aiStatus: 'unavailable',
      };
    }
    const payload = await providerResponse.json();
    const answer = payload?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
      return {
        response: 'The configured AI provider returned no answer. Try an offline command such as “show my progress.”',
        aiStatus: 'unavailable',
      };
    }
    return { response: answer.trim().slice(0, 1000), aiStatus: 'used' };
  } catch {
    return {
      response: 'The configured AI provider could not be reached. Try an offline command such as “show my progress” or “open my diet.”',
      aiStatus: 'unavailable',
    };
  }
}

export async function chat(req, res, next) {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  const { message, activeWorkoutId, activeExerciseId, activeExerciseName, context, allowAI, currentPlan, currentDietPlan } = parsed.data;
  const { timezoneOffsetMinutes } = parsed.data;
  const today = parsed.data.date || new Date().toISOString().slice(0, 10);
  const parsedDate = new Date(`${today}T00:00:00.000Z`);
  if (!datePattern.test(today) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== today) {
    return res.status(400).json({ error: 'Date must be a real date in YYYY-MM-DD format' });
  }
  const command = normalized(message);

  try {
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)$/.test(command)) {
      return res.json({ response: 'Hi! What can I help you with today?' });
    }

    if (currentPlan && /(?:different.*(?:tomorrow|today)|(?:tomorrow|today).*different)/.test(command)) {
      const recentWorkouts = await getFinishedWorkouts(req.user.id);
      const availableExercises = await getVisibleExercises(req.user.id);
      const differentPlan = generateWorkoutPlan({
        message: `${currentPlan.level} ${currentPlan.targetMuscles.join(' ')} workout ${currentPlan.availableMinutes} minutes ${[...new Set(currentPlan.exercises.map((exercise) => exercise.equipment))].join(' ')}`,
        user: req.user,
        exercises: availableExercises,
        history: recentWorkouts,
        date: today,
        avoidExerciseIds: currentPlan.exercises.map((exercise) => exercise.exerciseId),
      });
      if (!differentPlan) {
        return res.json({ response: 'I could not find a sufficiently different plan in your exercise library. Try changing the target muscles or equipment.' });
      }
      differentPlan.title = `Tomorrow's ${differentPlan.title}`;
      return res.json({
        response: `I created a different plan for tomorrow. It should take about ${differentPlan.estimatedMinutes} minutes; review it before saving.`,
        action: { type: 'SHOW_WORKOUT_PLAN' },
        data: { plan: differentPlan },
      });
    }

    if (currentPlan) {
      const availableExercises = await getVisibleExercises(req.user.id);
      const edit = editWorkoutPlan({ currentPlan, instruction: command, exercises: availableExercises });
      if (edit?.error) return res.json({ response: edit.error });
      if (edit?.plan) {
        return res.json({
          response: edit.response,
          action: { type: 'SHOW_WORKOUT_PLAN' },
          data: { plan: edit.plan },
        });
      }
    }

    if (requestsWorkoutPlan(command)) {
      const [availableExercises, recentWorkouts, activeSession] = await Promise.all([
        getVisibleExercises(req.user.id),
        getFinishedWorkouts(req.user.id),
        activeWorkoutId
          ? prisma.workoutSession.findFirst({
            where: { id: activeWorkoutId, ownerId: req.user.id },
            include: { exercises: true },
          })
          : Promise.resolve(null),
      ]);
      const plan = generateWorkoutPlan({
        message: command,
        user: req.user,
        exercises: availableExercises,
        history: activeSession && !activeSession.finishedAt ? [activeSession, ...recentWorkouts] : recentWorkouts,
        date: today,
        context,
      });
      if (!plan) {
        return res.json({
          response: 'I could not build a safe match from your available exercises. Recent training may mean those muscles need recovery; try another muscle group, equipment, or difficulty.',
        });
      }
      return res.json({
        response: `I created a ${plan.level.toLowerCase()} ${plan.title.toLowerCase()} for ${plan.date}. It should take about ${plan.estimatedMinutes} minutes. ${plan.recoveryNote || ''}Review the plan before saving or starting it.`,
        action: { type: 'SHOW_WORKOUT_PLAN' },
        data: { plan },
      });
    }

    if (currentDietPlan) {
      const logMealRequest = command.match(/^(?:log|add)(?: my| this)? (breakfast|morning snack|lunch|dinner|evening snack|snack)(?: to my food log)?$/);
      if (logMealRequest) {
        const requestedMeal = logMealRequest[1];
        const mealType = requestedMeal === 'breakfast' ? 'BREAKFAST'
          : requestedMeal === 'lunch' ? 'LUNCH'
            : requestedMeal === 'dinner' ? 'DINNER'
              : 'SNACKS';
        const meal = currentDietPlan.meals.find((item) => item.mealType === mealType);
        if (!meal) return res.json({ response: `There is no ${requestedMeal} in the current nutrition plan.` });
        return res.json({
          response: `I found ${meal.name} in your plan. Review the portions and confirm to log it as ${requestedMeal}.`,
          action: {
            type: 'CONFIRM_FOOD',
            date: currentDietPlan.date,
            mealType,
            items: meal.ingredients,
          },
          data: { meal: meal.name, nutrition: meal.nutrition },
        });
      }
      const availableFoods = await prisma.food.findMany({
        where: { AND: [{ OR: [{ ownerId: null }, { ownerId: req.user.id }] }] },
        orderBy: { name: 'asc' },
        take: 200,
      });
      const edit = editDietPlan({ plan: currentDietPlan, instruction: command, foods: availableFoods });
      if (edit?.error) return res.json({ response: edit.error });
      if (edit?.response && !edit.plan) return res.json({ response: edit.response });
      if (edit?.plan) {
        const balance = await getPlanBalance(req.user.id, req.user, edit.plan, timezoneOffsetMinutes);
        return res.json({
          response: edit.response,
          action: { type: 'SHOW_DIET_PLAN' },
          data: { plan: edit.plan, balance },
        });
      }
    }

    if (/^(show|open|view) (my |the )?(saved |latest )?(diet plan|diet plans|nutrition plans)$/.test(command)) {
      const plans = await prisma.dietPlan.findMany({
        where: { ownerId: req.user.id },
        include: { meals: true },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      });
      if (!plans.length) {
        return res.json({ response: 'You do not have any saved diet plans yet. Create a nutrition plan, review it, then say save my diet plan.' });
      }
      const names = plans.map((plan) => `${plan.name} for ${plan.date.toISOString().slice(0, 10)}`).join('; ');
      return res.json({
        response: `I found ${plans.length} saved diet plan${plans.length === 1 ? '' : 's'}: ${names}.`,
        action: { type: 'NAVIGATE', path: '/app/diet' },
        data: { plans },
      });
    }

    const requestsDietPlan = /\b(create|make|build|generate|plan)\b.*\b(nutrition plan|diet|meal plan|meals|food plan|weekly diet)\b/.test(command)
      || /\b(plan|create|make|generate)\b.*\b(my )?food\b/.test(command)
      || /\b(gain muscle|build muscle|gain weight|lose weight)\b.*\b(plan|create|make|generate)\b.*\bfood\b/.test(command)
      || /\b(give me|show me)\b.*\b(diet|nutrition|meal|food) (plan)?\b/.test(command)
      || /^(what should i eat today|create (a )?weekly (nutrition|diet) plan|plan my meals for today|give me (a )?(high protein|vegetarian|weight loss|weight gain|muscle gain).*diet plan)$/.test(command)
      || /\b(diet plan|meal plan)\b.*\b(for|today|tomorrow|weight loss|weight gain|vegetarian|high protein)\b/.test(command);
    if (requestsDietPlan) {
      const [foods, target] = await Promise.all([
        prisma.food.findMany({
          where: { AND: [{ OR: [{ ownerId: null }, { ownerId: req.user.id }] }] },
          orderBy: { name: 'asc' },
          take: 200,
        }),
        getNutritionTarget(req.user),
      ]);
      if (/\b(weekly|seven[- ]day|week(?:ly)? plan)\b/.test(command)) {
        const generatedWeek = await generateDietPlanWeekWithProvider({
          message: command,
          user: req.user,
          foods,
          target,
          date: today,
        });
        if (generatedWeek.plans.length !== 7) {
          return res.json({ response: 'I could not create all seven days from your food library. Try a broader dietary preference or use a daily plan.' });
        }
        const calories = round1(generatedWeek.plans.reduce((sum, plan) => sum + plan.estimatedCalories, 0));
        const protein = round1(generatedWeek.plans.reduce((sum, plan) => sum + plan.estimatedProteinGrams, 0));
        return res.json({
          response: `I created a seven-day nutrition plan from ${generatedWeek.plans[0].date} through ${generatedWeek.plans[6].date}. The estimated weekly totals are ${calories} calories and ${protein} g protein. Review the daily meals before saving.`,
          action: { type: 'SHOW_DIET_WEEK' },
          data: { plans: generatedWeek.plans, generationMethod: generatedWeek.generationMethod },
        });
      }
      const generated = await generateDietPlanWithProvider({ message: command, user: req.user, foods, target, date: today });
      const plan = generated?.plan;
      if (!plan) {
        return res.json({ response: 'I could not build a suitable diet plan from the foods in your library. Try another dietary preference or open the nutrition page.' });
      }
      const balance = await getPlanBalance(req.user.id, req.user, plan, timezoneOffsetMinutes);
      return res.json({
        response: `I created a ${plan.meals.length}-meal diet plan for ${plan.date}. It is estimated at ${plan.estimatedCalories} calories and ${plan.estimatedProteinGrams} g protein. Review it before saving or logging meals.`,
        action: { type: 'SHOW_DIET_PLAN' },
        data: { plan, balance, generationMethod: generated.generationMethod },
      });
    }

    const combinedExerciseNavigation = command.match(/^(?:open|go to|show) (?:the )?(?:exercise library|exercises|exercise page) and (?:show|filter)(?: me)? (chest|back|legs?|shoulders?|arms?|core) exercises$/);
    if (combinedExerciseNavigation) {
      const requestedGroup = combinedExerciseNavigation[1];
      const muscleGroup = requestedGroup.startsWith('leg') ? 'Legs'
        : requestedGroup.startsWith('shoulder') ? 'Shoulders'
          : requestedGroup.startsWith('arm') ? 'Arms'
            : `${requestedGroup[0].toUpperCase()}${requestedGroup.slice(1)}`;
      const exercises = (await getVisibleExercises(req.user.id))
        .filter((exercise) => exercise.muscleGroup === muscleGroup)
        .slice(0, 5);
      return res.json({
        response: exercises.length
          ? `Opening the exercise library filtered to ${muscleGroup}. I found ${exercises.map((exercise) => exercise.name).join(', ')}.`
          : `Opening the exercise library filtered to ${muscleGroup}. There are no matching exercises in your library yet.`,
        action: { type: 'NAVIGATE', path: `/app/exercises?muscleGroup=${encodeURIComponent(muscleGroup)}` },
        data: { muscleGroup, exercises: exercises.map(({ id, name }) => ({ id, name })) },
      });
    }

    const combinedNutritionNavigation = /^(?:open|go to|show) (?:my )?(?:nutrition|diet|diet page|food tracker)(?: page)? and (?:show|tell me|check) (?:my )?(protein|calories|meals|food)(?: today)?$/.exec(command);
    if (combinedNutritionNavigation) {
      const { start, end } = dateBounds(today, timezoneOffsetMinutes);
      const [logs, target] = await Promise.all([
        prisma.foodLog.findMany({
          where: { ownerId: req.user.id, loggedAt: { gte: start, lte: end } },
          orderBy: { loggedAt: 'desc' },
        }),
        getNutritionTarget(req.user),
      ]);
      const totals = summarizeFoodLogs(logs);
      const requestedData = combinedNutritionNavigation[1];
      const response = requestedData === 'protein'
        ? `Opening nutrition. Today you have consumed ${round1(totals.proteinGrams)} g protein toward your ${target.proteinGrams} g target.`
        : requestedData === 'calories'
          ? `Opening nutrition. Today you have consumed ${round1(totals.calories)} calories toward your ${target.dailyCalories} calorie target.`
          : `Opening nutrition. You have ${logs.length} food entries logged today.`;
      return res.json({
        response,
        action: { type: 'SHOW_NUTRITION', path: '/app/diet' },
        data: { totals, target, logs },
      });
    }

    if (/^(?:open|go to|show) (?:today'?s workout|my workout today|today'?s training)$/.test(command)) {
      return res.json({
        response: 'Opening today’s workout schedule.',
        action: { type: 'NAVIGATE', path: `/app/planner?date=${today}&view=TODAY` },
      });
    }

    if (/^(?:open|go to|show|view) (?:my )?(?:monthly|month) (?:workout )?(?:schedule|timetable|calendar)$/.test(command)) {
      const monthStart = `${today.slice(0, 7)}-01`;
      return res.json({
        response: 'Opening your monthly workout calendar.',
        action: { type: 'NAVIGATE', path: `/app/planner?date=${monthStart}&view=MONTHLY` },
      });
    }

    if (/^(?:open|go to|show|view) (?:my )?(?:weekly|week) (?:workout )?(?:schedule|timetable|calendar)$/.test(command)) {
      return res.json({
        response: 'Opening your weekly workout schedule.',
        action: { type: 'NAVIGATE', path: `/app/planner?date=${today}&view=WEEKLY` },
      });
    }

    const splitWorkoutIntent = command.match(/^(?:start|begin) (?:my |the |a )?(leg|legs|push|pull|upper body|lower body|full body)(?: day)?(?: workout)?$/);
    if (splitWorkoutIntent) {
      const focus = splitWorkoutIntent[1].replace(/s$/, '');
      const templates = await prisma.workoutTemplate.findMany({
        where: { ownerId: req.user.id },
        orderBy: { updatedAt: 'desc' },
      });
      const pattern = focus === 'leg' || focus === 'legs'
        ? /\b(leg|legs|lower body)\b/i
        : focus === 'push'
          ? /\b(push|chest)\b/i
          : focus === 'pull'
            ? /\b(pull|back)\b/i
            : new RegExp(`\\b${focus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const matches = templates.filter((template) => pattern.test(template.name));
      if (!matches.length) {
        return res.json({
          response: `I could not find a saved ${focus} workout template. Create one in your workout builder first.`,
          action: { type: 'NAVIGATE', path: '/app/workouts' },
        });
      }
      return res.json({
        response: matches.length === 1
          ? `I found ${matches[0].name}. Confirm if you want to start it.`
          : `Choose which ${focus} workout you want to start.`,
        action: { type: 'CHOOSE_WORKOUT', templates: matches.map(({ id, name }) => ({ id, name })) },
      });
    }

    const openSplitWorkoutIntent = command.match(/^(?:open|show|view) (?:my )?(leg|legs|push|pull|upper body|lower body|full body)(?: day)? workout$/);
    if (openSplitWorkoutIntent) {
      const focus = openSplitWorkoutIntent[1].replace(/s$/, '');
      const templates = await prisma.workoutTemplate.findMany({
        where: { ownerId: req.user.id },
        orderBy: { updatedAt: 'desc' },
      });
      const pattern = focus === 'leg' || focus === 'legs'
        ? /\b(leg|legs|lower body)\b/i
        : focus === 'push'
          ? /\b(push|chest)\b/i
          : focus === 'pull'
            ? /\b(pull|back)\b/i
            : new RegExp(`\\b${focus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const template = templates.find((item) => pattern.test(item.name));
      if (template) {
        return res.json({
          response: `Opening your ${template.name} template.`,
          action: { type: 'NAVIGATE', path: `/app/workouts?template=${encodeURIComponent(template.id)}` },
        });
      }
      const muscleGroup = focus === 'leg' || focus === 'legs' || focus === 'lower body'
        ? 'Legs'
        : focus === 'push' ? 'Chest' : focus === 'pull' ? 'Back' : null;
      const path = muscleGroup
        ? `/app/exercises?muscleGroup=${encodeURIComponent(muscleGroup)}`
        : '/app/workouts';
      return res.json({
        response: `You do not have a saved ${focus} template yet. Opening ${muscleGroup ? `the ${muscleGroup.toLowerCase()} exercise library` : 'your workout templates'}.`,
        action: { type: 'NAVIGATE', path },
      });
    }

    const navigationPrefix = '(?:(?:open|go to|show|view|take me to|navigate to)\\s+)?';
    const navigation = [
      { matches: new RegExp(`^${navigationPrefix}(?:the )?(?:my )?dashboard$`), path: '/app', response: 'Opening your dashboard.' },
      { matches: new RegExp(`^${navigationPrefix}(?:my workout|my workout templates|workout templates|workouts?|workout builder|workout page)$`), path: '/app/workouts', response: 'Opening your workout templates.' },
      { matches: new RegExp(`^${navigationPrefix}(?:my )?(?:workout )?(?:planner|schedule|workout calendar|weekly schedule)$`), path: `/app/planner?date=${today}&view=WEEKLY`, response: 'Opening your workout planner.' },
      { matches: new RegExp(`^${navigationPrefix}(?:my )?(?:workout )?(?:history|previous workouts)(?: page)?$`), path: '/app/workouts/history', response: 'Opening your workout history.' },
      { matches: new RegExp(`^${navigationPrefix}(?:the )?(?:exercise library|exercises|exercise page)$`), path: '/app/exercises', response: 'Opening your exercise library.' },
      { matches: new RegExp(`^${navigationPrefix}(?:the )?(?:my )?(?:diet|diet page|nutrition|nutrition page|food tracker|meals|food)$`), path: '/app/diet', response: 'Opening your nutrition page.' },
      { matches: new RegExp(`^${navigationPrefix}(?:my )?(?:overall(?: progress)?|progress(?: dashboard)?)(?: page)?$`), path: '/app/progress', response: 'Opening your overall progress.' },
      { matches: new RegExp(`^${navigationPrefix}(?:my )?(?:profile|account)(?: page)?$`), path: '/app/profile', response: 'Opening your profile.' },
    ];
    const nav = navigation.find(({ matches }) => matches.test(command));
    if (nav) return res.json({ response: nav.response, action: { type: 'NAVIGATE', path: nav.path } });

    if (/^(what workout should i do( today)?|recommend a workout( for today)?|suggest a workout( for today)?)$/.test(command)) {
      const currentWorkout = await activeWorkout(req.user.id, activeWorkoutId);
      if (currentWorkout) {
        return res.json({
          response: `You already have ${currentWorkout.name} in progress. Would you like to return to it?`,
          action: { type: 'CONFIRM_NAVIGATION', path: `/app/workouts/live/${currentWorkout.id}` },
        });
      }
      const templates = await prisma.workoutTemplate.findMany({
        where: { ownerId: req.user.id },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      });
      if (!templates.length) {
        return res.json({
          response: 'I do not see a workout template in your account yet. Start with a comfortable full-body routine, or create a plan in your workout builder.',
          action: { type: 'NAVIGATE', path: '/app/workouts' },
        });
      }
      return res.json({
        response: `Based on the plans you have saved, ${templates[0].name} is ready for today. Would you like to open your workout plans?`,
        action: { type: 'CONFIRM_NAVIGATION', path: '/app/workouts' },
        data: { suggestedTemplateId: templates[0].id },
      });
    }

    const goalNavigation = command.match(/^(go to|open|show) (weight gain|weight loss|maintain weight)$/);
    if (goalNavigation) {
      const goal = goalNavigation[2] === 'weight gain'
        ? 'WEIGHT_GAIN'
        : goalNavigation[2] === 'weight loss' ? 'WEIGHT_LOSS' : 'MAINTAIN_WEIGHT';
      return res.json({
        response: `Opening your profile with ${goalNavigation[2]} selected. Review the change and save it when ready.`,
        action: { type: 'NAVIGATE', path: `/app/profile?goal=${goal}` },
      });
    }

    if (/^(what is my (fitness )?goal|what's my (fitness )?goal|tell me my goal)$/.test(command)) {
      const labels = {
        WEIGHT_GAIN: 'weight gain',
        WEIGHT_LOSS: 'weight loss',
        MAINTAIN_WEIGHT: 'weight maintenance',
        BUILD_STRENGTH: 'building strength',
      };
      return res.json({
        response: `Your saved fitness goal is ${labels[req.user.fitnessGoal] || 'not set'}.`,
        action: { type: 'NAVIGATE', path: '/app/profile' },
        data: { fitnessGoal: req.user.fitnessGoal },
      });
    }

    if (/^(start|begin) (a |my )?(workout|session)$/.test(command)) {
      const currentWorkout = await activeWorkout(req.user.id, activeWorkoutId);
      if (currentWorkout) {
        return res.json({
          response: `You already have ${currentWorkout.name} in progress. Returning to that workout.`,
          action: { type: 'NAVIGATE', path: `/app/workouts/live/${currentWorkout.id}` },
        });
      }
      const templates = await prisma.workoutTemplate.findMany({
        where: { ownerId: req.user.id },
        orderBy: { updatedAt: 'desc' },
      });
      if (!templates.length) return res.json({ response: 'You do not have a workout template yet. Open the workout builder to create one.' });
      return res.json({
        response: templates.length === 1 ? `Ready to start ${templates[0].name}. Confirm below.` : 'Choose one of your workout templates to start.',
        action: { type: 'CHOOSE_WORKOUT', templates: templates.map(({ id, name }) => ({ id, name })) },
      });
    }

    if (isSetCompletionCommand(command)) {
      const session = await activeWorkout(req.user.id, activeWorkoutId);
      if (!session || session.finishedAt) {
        return res.json({ response: 'I could not find an active workout belonging to your account.' });
      }
      const exercise = session.exercises.find((item) => item.id === activeExerciseId)
        || session.exercises.find((item) => item.sets.length < item.targetSets);
      if (!exercise) return res.json({ response: 'All planned sets are complete. Move to another exercise or finish your workout.' });
      const reps = Number(command.match(/\b(\d{1,4})\s+reps?\b/)?.[1]);
      if (!Number.isInteger(reps) || reps < 1 || reps > 1000) {
        return res.json({ response: 'Tell me the number of completed reps, from 1 to 1000.' });
      }
      const weightMatch = command.match(/\b(?:at|using|with)\s+(\d+(?:\.\d+)?)\s*(kg|kilograms|lb|lbs|pounds)\b/);
      const lastSet = exercise.sets.at(-1);
      let weightKg = weightMatch
        ? Number(weightMatch[1]) * (/^(lb|lbs|pounds)$/.test(weightMatch[2]) ? 0.45359237 : 1)
        : lastSet?.weightKg ?? exercise.targetWeightKg;
      if (weightKg == null && exercise.equipment === 'Bodyweight') weightKg = 0;
      if (weightKg == null) {
        return res.json({
          response: `How much weight did you use for ${exercise.name}? I will not guess the load.`,
          action: {
            type: 'ASK_SET_WEIGHT',
            workoutId: session.id,
            exerciseId: exercise.id,
            setNumber: exercise.sets.length + 1,
            reps,
            exerciseName: exercise.name,
          },
        });
      }
      const setNumber = exercise.sets.length + 1;
      if (setNumber > exercise.targetSets) {
        return res.json({ response: `All ${exercise.targetSets} planned sets of ${exercise.name} are already logged.` });
      }
      return res.json({
        response: `I am logging ${reps} reps for set ${setNumber} of ${exercise.name}.`,
        action: {
          type: 'LOG_SET',
          workoutId: session.id,
          exerciseId: exercise.id,
          setNumber,
          reps,
          weightKg: Math.round(weightKg * 100) / 100,
        },
      });
    }

    const weightChange = command.match(/^(?:set|change) (?:the )?weight(?: to)? (\d+(?:\.\d+)?)\s*(kg|kilograms?|lb|lbs|pounds?)?$/);
    const repsChange = command.match(/^(?:set|change) (?:the )?reps?(?: to)? (\d{1,4})$/);
    const restDuration = command.match(/^(?:start|set) (?:a )?(?:rest )?timer(?: for)? (\d{1,3})\s*(seconds?|secs?)$/);
    const workoutControlIntent = /^(start|pause|resume) (the )?(my )?(workout )?timer$/.test(command)
      || /^(next exercise|previous exercise|skip rest|skip (this|the current) exercise|start rest timer|complete (the )?(current )?set)$/.test(command)
      || Boolean(weightChange || repsChange || restDuration);
    if (workoutControlIntent) {
      const workout = await activeWorkout(req.user.id, activeWorkoutId);
      if (!workout) return res.json({ response: 'Open one of your active workouts first, then try that command.' });
      const currentExercise = workout.exercises.find((item) => item.id === activeExerciseId)
        || workout.exercises.find((item) => item.sets.length < item.targetSets)
        || workout.exercises[0];
      let actionType;
      let actionData = {};
      if (weightChange) {
        const weightValue = Number(weightChange[1]);
        if (!Number.isFinite(weightValue) || weightValue > 10000) {
          return res.json({ response: 'Enter a weight from 0 to 10000, in kg or pounds.' });
        }
        actionType = 'SET_WEIGHT';
        actionData.weightKg = Math.round(weightValue * (/^(lb|lbs|pound|pounds)$/.test(weightChange[2] || '') ? 0.45359237 : 1) * 100) / 100;
      } else if (repsChange) {
        const reps = Number(repsChange[1]);
        if (!Number.isInteger(reps) || reps < 1 || reps > 1000) {
          return res.json({ response: 'Reps must be a whole number from 1 to 1000.' });
        }
        actionType = 'SET_REPS';
        actionData.reps = reps;
      } else if (restDuration) {
        const seconds = Number(restDuration[1]);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
          return res.json({ response: 'Rest duration must be from 1 to 3600 seconds.' });
        }
        actionType = 'START_REST_TIMER';
        actionData.restSeconds = seconds;
      } else if (command === 'complete set' || command === 'complete the set' || command === 'complete current set' || command === 'complete the current set') {
        actionType = 'COMPLETE_SET';
      } else if (command === 'start rest timer') {
        actionType = 'START_REST_TIMER';
        actionData.restSeconds = currentExercise?.restSeconds || 60;
      } else if (command === 'previous exercise') {
        actionType = 'PREVIOUS_EXERCISE';
      } else if (command === 'next exercise' || command.startsWith('skip ') && command.endsWith('exercise')) {
        actionType = 'NEXT_EXERCISE';
      } else if (command === 'skip rest') {
        actionType = 'SKIP_REST';
      } else if (command.startsWith('pause ')) {
        actionType = 'PAUSE_TIMER';
      } else {
        actionType = 'RESUME_TIMER';
      }
      const labels = {
        RESUME_TIMER: 'Starting or resuming your workout timer.',
        PAUSE_TIMER: 'Pausing your workout timer.',
        NEXT_EXERCISE: 'Moving to the next exercise.',
        PREVIOUS_EXERCISE: 'Moving to the previous exercise.',
        SKIP_REST: 'Skipping the rest timer.',
        START_REST_TIMER: 'Starting the rest timer.',
        SET_WEIGHT: 'Updating the weight for your current set. Say “complete set” when your entry is ready to log.',
        SET_REPS: 'Updating reps for your current set. Say “complete set” when your entry is ready to log.',
        COMPLETE_SET: 'Logging the current set.',
      };
      return res.json({
        response: labels[actionType],
        action: {
          type: 'WORKOUT_CONTROL',
          command: actionType,
          workoutId: workout.id,
          ...(currentExercise ? { exerciseId: currentExercise.id } : {}),
          ...actionData,
        },
      });
    }

    if (/^(finish|end) (my )?(active )?workout$/.test(command)) {
      const workout = await activeWorkout(req.user.id, activeWorkoutId);
      if (!workout) return res.json({ response: 'Open one of your active workouts first. I cannot finish a workout from another account.' });
      return res.json({
        response: `Do you want to finish ${workout.name}? Confirm below. Your completed sets will be saved.`,
        action: { type: 'CONFIRM_FINISH', workoutId: workout.id, workoutName: workout.name },
      });
    }

    if (command === 'explain current exercise') {
      const exercises = await getVisibleExercises(req.user.id);
      const exercise = exercises.find((item) => item.id === activeExerciseId)
        || exercises.find((item) => exerciseSearchText(item.name) === exerciseSearchText(activeExerciseName || ''));
      if (!exercise) {
        return res.json({ response: 'Open an exercise from your library or an active workout, then ask me to repeat its instructions.' });
      }
      const instructions = exercise.instructions.slice(0, 4).join(' ');
      return res.json({
        response: `${exercise.name}: ${exercise.description} ${instructions}`.trim(),
        action: {
          type: 'NAVIGATE',
          path: `/app/exercises?search=${encodeURIComponent(exercise.name)}&exercise=${encodeURIComponent(exercise.id)}`,
          exerciseId: exercise.id,
        },
        data: { exercise },
      });
    }

    const exerciseRequest = command.match(/^(?:how much weight did i lift on|show my|find my) (?:my )?(.+?)(?: exercise)?$/);
    if (exerciseRequest && !/^(show (my |the )?(daily|weekly|monthly|overall) progress|show my progress|show my personal records|show my prs|show today'?s meals|show my meals today|show weekly progress|show my weekly progress|how is (my |the )?progress)$/.test(command)) {
      const requestedExercise = exerciseRequest[1].trim();
      const workouts = await getFinishedWorkouts(req.user.id);
      const matches = workouts.flatMap((workout) => workout.exercises
        .filter((exercise) => exercise.name.toLowerCase().includes(requestedExercise))
        .flatMap((exercise) => exercise.sets.filter((set) => set.completed)
          .map((set) => ({ exercise: exercise.name, weightKg: set.weightKg, reps: set.reps, date: workout.finishedAt || workout.startedAt }))));
      if (!matches.length) return res.json({ response: `I could not find a completed ${requestedExercise} in your workout history.` });
      const latest = matches[0];
      return res.json({
        response: `Your latest ${latest.exercise} log was ${latest.weightKg} kg for ${latest.reps} reps. I found ${matches.length} logged sets in your history.`,
        action: { type: 'NAVIGATE', path: `/app/progress?exercise=${encodeURIComponent(latest.exercise)}` },
        data: { exercise: latest.exercise, weightKg: latest.weightKg, reps: latest.reps, date: latest.date },
      });
    }

    if (/^(how many( reps| sets)? should i do|how many reps|what reps should i do|how many should i do)$/.test(command)) {
      const exercise = activeExerciseId
        ? await prisma.exercise.findFirst({
          where: { AND: [{ id: activeExerciseId }, { OR: [{ ownerId: null }, { ownerId: req.user.id }] }] },
        })
        : null;
      if (!exercise) {
        return res.json({ response: 'Which exercise are you asking about? Tell me its name or open it from the exercise library first.' });
      }
      const recommendation = exercise.difficulty === 'Beginner'
        ? 'start with 2 or 3 sets of 8 to 12 controlled reps, and stop if your form breaks down.'
        : exercise.difficulty === 'Advanced'
          ? 'a reasonable starting point is 3 or 4 sets of 6 to 10 controlled reps, adjusted to your training plan.'
          : 'a reasonable starting point is 3 sets of 8 to 12 controlled reps, adjusted to your training plan.';
      return res.json({ response: `For ${exercise.name}, ${recommendation}` });
    }

    if (/^(how much weight did i lift|how much did i lift)$/.test(command)) {
      const workouts = await getFinishedWorkouts(req.user.id);
      if (!workouts.length) return res.json({ response: 'There are no completed workouts in your history yet.' });
      return res.json({
        response: `Your latest workout, ${workouts[0].name}, had ${round1(workoutVolume(workouts[0]))} kg-reps of completed lifting volume.`,
        data: { volumeKg: round1(workoutVolume(workouts[0])), workoutName: workouts[0].name },
      });
    }

    const progressRequest = /^(how is (my |the )?progress|show (my |the )?(daily|weekly|monthly|overall) progress|show my progress for this month|how much progress did i make|show (my )?daily progress|show (my )?weekly progress|show (my )?monthly progress|how many workouts did i complete (this week|today)|how much weight did i lift|did i improve|compare (this week|today) with (last week|yesterday)|how many calories did i consume (this week|today)|show my (protein|calorie) progress)$/.test(command);
    if (progressRequest) {
      const range = /\bmonthly\b|this month|month/.test(command)
        ? 'month'
        : /\bweekly\b|this week|week/.test(command)
          ? 'week'
          : 'day';
      const summary = await voiceProgressSummary(req.user.id, req.user, today, range, timezoneOffsetMinutes);
      const label = range === 'month' ? 'This month' : range === 'week' ? 'This week' : 'Today';
      let response;
      if (!summary.workouts.completed && !summary.nutrition.calories && !summary.weight.entries.length) {
        response = `${label} has no saved workout, nutrition or weight records yet. Start logging your training or food to build progress.`;
      } else {
        response = `${label}: ${summary.workouts.completed} workouts completed, ${summary.workouts.durationSeconds} seconds trained, ${summary.workouts.sets} completed sets, ${summary.workouts.volumeKg} kg-reps of lifting volume, ${summary.nutrition.calories} calories consumed, and ${summary.nutrition.proteinGrams} g protein consumed.`;
        if (range !== 'day' && (summary.workouts.previousCompleted || summary.nutrition.previousCalories)) {
          const difference = summary.workouts.completed - summary.workouts.previousCompleted;
          const calorieDifference = round1(summary.nutrition.calories - summary.nutrition.previousCalories);
          const proteinDifference = round1(summary.nutrition.proteinGrams - summary.nutrition.previousProteinGrams);
          response += ` Compared with the previous period, workouts changed by ${difference}, calories by ${calorieDifference}, and protein by ${proteinDifference} g.`;
        }
      }
      return res.json({
        response,
        action: { type: 'SHOW_PROGRESS', path: '/app/progress', range, data: summary },
        data: summary,
      });
    }

    if (/^(how many workouts have i completed|how many workouts have i done|show (my )?weekly progress)$/.test(command)) {
      const workouts = await getFinishedWorkouts(req.user.id);
      const weekly = filterWorkoutsByRange(workouts, 'thisWeek');
      const totals = summarizeWorkouts(weekly);
      return res.json({
        response: `This week you completed ${totals.workouts} workouts with ${round1(totals.volumeKg)} kg-reps of volume. You have completed ${workouts.length} workouts overall.`,
        action: { type: 'NAVIGATE', path: '/app/progress' },
        data: { totalWorkouts: workouts.length, weeklyWorkouts: totals.workouts, weeklyVolumeKg: round1(totals.volumeKg) },
      });
    }

    if (/^(show|open) (my )?(personal records|prs)$/.test(command)) {
      const records = await prisma.personalRecord.findMany({
        where: { ownerId: req.user.id },
        orderBy: { achievedAt: 'desc' },
        take: 3,
      });
      if (!records.length) return res.json({ response: 'No personal records have been recorded yet. Log a completed set to start tracking them.' });
      const summary = records.map((record) => `${record.exerciseName}: ${record.recordType === 'MAX_REPS_AT_WEIGHT' ? `${record.value} reps` : `${round1(record.value)} kg`}`).join('; ');
      return res.json({ response: `Your latest personal records are: ${summary}.`, action: { type: 'NAVIGATE', path: '/app/progress' }, data: { records } });
    }

    if (/^(how much weight did i gain or lose|show my weight change|weight change)$/.test(command)) {
      const entries = await prisma.weightEntry.findMany({ where: { ownerId: req.user.id }, orderBy: { date: 'asc' } });
      const firstWeight = entries[0]?.weightKg ?? req.user.startingWeightKg;
      const currentWeight = entries[entries.length - 1]?.weightKg ?? req.user.currentWeightKg;
      const change = round1(currentWeight - firstWeight);
      const direction = change > 0 ? 'gained' : change < 0 ? 'lost' : 'changed by';
      return res.json({
        response: `Your recorded weight ${direction} ${Math.abs(change)} kg, from ${firstWeight} kg to ${currentWeight} kg.`,
        action: { type: 'NAVIGATE', path: '/app/progress' },
        data: { startingWeightKg: firstWeight, currentWeightKg: currentWeight, changeKg: change },
      });
    }

    const foodIntent = /^(i (just )?(ate|had)|add|log)\b/.test(command);
    if (foodIntent) {
      const visibleFoods = await prisma.food.findMany({
        where: { AND: [{ OR: [{ ownerId: null }, { ownerId: req.user.id }] }] },
        orderBy: { name: 'asc' },
        take: 200,
      });
      const items = parseFoodMentions(message, visibleFoods);
      if (!items.length) return res.json({ response: 'I could not confidently match a food in your library. Try naming one food at a time, such as “I ate two eggs.”' });
      const totals = summarizeFoodMentions(items);
      const requestedMeal = command.match(/\b(breakfast|lunch|dinner|snack)\b/)?.[1];
      const mealType = requestedMeal === 'snack' ? 'SNACKS' : requestedMeal?.toUpperCase();
      return res.json({
        response: `I recognized ${items.map(foodQuantityLabel).join(' and ')}: about ${round1(totals.calories)} calories, ${round1(totals.proteinGrams)} g protein, ${round1(totals.carbohydratesGrams)} g carbohydrates, and ${round1(totals.fatGrams)} g fat. Confirm to add this to your food log.`,
        action: { type: 'CONFIRM_FOOD', items, date: today, ...(mealType ? { mealType } : {}) },
        data: totals,
      });
    }

    if (/^(how many calories (are )?in|how much protein (is )?in|nutrition in)\b/.test(command)) {
      const visibleFoods = await prisma.food.findMany({
        where: { AND: [{ OR: [{ ownerId: null }, { ownerId: req.user.id }] }] },
        orderBy: { name: 'asc' },
        take: 200,
      });
      const items = parseFoodMentions(message, visibleFoods);
      if (!items.length) {
        return res.json({ response: 'I could not match that food in your library. Try asking about a listed food, such as “How many calories are in two eggs?”' });
      }
      const totals = summarizeFoodMentions(items);
      const foodDescription = items.map(foodQuantityLabel).join(' and ');
      const agreement = items.length === 1 && items[0].quantity === 1 ? 'contains' : 'contain';
      return res.json({
        response: `${foodDescription} ${agreement} about ${round1(totals.calories)} calories, ${round1(totals.proteinGrams)} g of protein, ${round1(totals.carbohydratesGrams)} g of carbohydrates, and ${round1(totals.fatGrams)} g of fat.`,
        data: totals,
      });
    }

    if (/^(how many calories did i eat today|how much protein did i eat( today)?|how much protein (is )?remaining|how much protein should i eat( today)?|what is my protein target|what's my protein target|daily protein target|show today'?s meals|show my meals today|what did i eat today|what have i eaten today|what did i have today)$/.test(command)) {
      const { start, end } = dateBounds(today, timezoneOffsetMinutes);
      const [logs, target] = await Promise.all([
        prisma.foodLog.findMany({ where: { ownerId: req.user.id, loggedAt: { gte: start, lte: end } }, orderBy: { loggedAt: 'desc' } }),
        getNutritionTarget(req.user),
      ]);
      const totals = summarizeFoodLogs(logs);
      if (command.includes('meal') || command.includes('eat today') || command.includes('eaten today') || command.includes('have today')) {
        const meals = logs.length ? logs.map((log) => `${log.foodName} (${log.quantity} ${log.servingUnit})`).join(', ') : 'no foods logged yet';
        return res.json({ response: `Today's meals: ${meals}.`, action: { type: 'NAVIGATE', path: '/app/diet' }, data: { logs, totals } });
      }
      if (command.includes('protein target') || command.includes('daily protein target') || command.includes('should i eat')) {
        return res.json({
          response: `Your daily protein target is about ${target.proteinGrams} g, based on your saved profile and goal.`,
          action: { type: 'NAVIGATE', path: '/app/diet' },
          data: { proteinTargetGrams: target.proteinGrams },
        });
      }
      if (command.includes('remaining')) {
        const dailyTarget = target.proteinGrams;
        const remaining = round1(dailyTarget - totals.proteinGrams);
        const response = remaining > 0
          ? `You have about ${remaining} g of protein remaining toward your ${dailyTarget} g target.`
          : `You have reached your ${dailyTarget} g protein target for today.`;
        return res.json({ response, action: { type: 'NAVIGATE', path: '/app/diet' }, data: { ...totals, remainingProteinGrams: remaining } });
      }
      return res.json({
        response: command.includes('calories')
          ? `You have consumed about ${round1(totals.calories)} calories today.`
          : `You have consumed about ${round1(totals.proteinGrams)} g of protein today.`,
        action: { type: 'NAVIGATE', path: '/app/diet' },
        data: totals,
      });
    }

    if (/^(suggest high protein food|suggest a high protein food|suggest high protein foods)$/.test(command)) {
      const { start, end } = dateBounds(today, timezoneOffsetMinutes);
      const [foods, logs, target] = await Promise.all([
        prisma.food.findMany({ where: { AND: [{ OR: [{ ownerId: null }, { ownerId: req.user.id }] }] }, orderBy: { name: 'asc' }, take: 200 }),
        prisma.foodLog.findMany({ where: { ownerId: req.user.id, loggedAt: { gte: start, lte: end } } }),
        getNutritionTarget(req.user),
      ]);
      const totals = summarizeFoodLogs(logs);
      const suggestions = voiceFoodSuggestions(foods, {
        dietaryPreference: req.user.dietaryPreference,
        remainingCalories: target.dailyCalories - totals.calories,
        remainingProtein: target.proteinGrams - totals.proteinGrams,
        fitnessGoal: req.user.fitnessGoal,
      });
      return res.json({
        response: suggestions.length ? `Based on your dietary preference, try ${suggestions.join(', ')}.` : 'I could not find a suitable suggestion in your food library.',
        action: { type: 'NAVIGATE', path: '/app/diet' },
        data: { suggestions },
      });
    }

    if (/^(i have|i only have|i've got|i have only)\b/.test(command)) {
      const visibleFoods = await prisma.food.findMany({
        where: { AND: [{ OR: [{ ownerId: null }, { ownerId: req.user.id }] }] },
        orderBy: { name: 'asc' },
        take: 200,
      });
      const items = parseFoodMentions(message, visibleFoods);
      if (!items.length) {
        return res.json({ response: 'Tell me the foods and portions you have, such as “I have 100 grams of paneer and one chapati.”' });
      }
      const totals = summarizeFoodMentions(items);
      const names = items.map((item) => `${item.quantity} ${item.foodName}`).join(' and ');
      return res.json({
        response: `Using the portions in your food library, ${names} provide about ${round1(totals.calories)} calories, ${round1(totals.proteinGrams)} g protein, ${round1(totals.carbohydratesGrams)} g carbohydrates, and ${round1(totals.fatGrams)} g fat. I have not logged this food.`,
        data: { items, nutrition: totals },
      });
    }

    const tomorrowQuestion = /^(what about tomorrow|and tomorrow|what should i eat tomorrow|suggest a meal for tomorrow|what should i do tomorrow)$/.test(command);
    const tomorrowMeal = tomorrowQuestion && context?.topic === 'NUTRITION';
    if (tomorrowQuestion && context?.topic === 'EXERCISE') {
      return res.json({
        response: 'For tomorrow, choose a different muscle group or take a recovery day based on how you feel. Would you like to open your saved workout plans?',
        action: { type: 'CONFIRM_NAVIGATION', path: '/app/workouts' },
      });
    }
    const mealSuggestion = /^(suggest|recommend|plan) (me )?(a )?(meal|food)( for (weight gain|weight loss|tomorrow))?$/.test(command)
      || /^(i want to (gain|lose) weight suggest (me )?(a )?meal)$/.test(command)
      || /^(what should i eat to (gain|lose) weight)$/.test(command)
      || /^(i want to (gain|lose) weight what should i eat)$/.test(command)
      || /^i want to (gain|lose) weight.*\b(suggest|recommend)\b.*\b(meal|food|breakfast|lunch|dinner|snack)\b/.test(command)
      || /^(suggest|recommend)\b.*\b(meal|breakfast|lunch|dinner|snack)\b/.test(command)
      || /^(what should i eat|what can i eat)( today)?$/.test(command)
      || /^what should i eat for (breakfast|lunch|dinner|snack)( today)?$/.test(command)
      || (context?.topic === 'NUTRITION' && /^(what should i eat|what can i eat|suggest something to eat|recommend something to eat)$/.test(command));
    if (tomorrowMeal || mealSuggestion) {
      const { start, end } = dateBounds(today, timezoneOffsetMinutes);
      const [foods, logs, target] = await Promise.all([
        prisma.food.findMany({ where: { AND: [{ OR: [{ ownerId: null }, { ownerId: req.user.id }] }] }, orderBy: { name: 'asc' }, take: 200 }),
        tomorrowMeal ? Promise.resolve([]) : prisma.foodLog.findMany({ where: { ownerId: req.user.id, loggedAt: { gte: start, lte: end } } }),
        getNutritionTarget(req.user),
      ]);
      const totals = summarizeFoodLogs(logs);
      const requestedGoal = command.includes('gain weight') || command.includes('weight gain') ? 'WEIGHT_GAIN'
        : command.includes('lose weight') ? 'WEIGHT_LOSS'
          : context?.goal || req.user.fitnessGoal;
      const dietaryPreference = /\bvegan\b/.test(command) ? 'VEGAN'
        : /\bvegetarian\b/.test(command) ? 'VEGETARIAN'
          : req.user.dietaryPreference;
      const suggestions = buildMealSuggestions(foods, {
        dietaryPreference,
        remainingCalories: tomorrowMeal ? target.dailyCalories : target.dailyCalories - totals.calories,
        remainingProtein: target.proteinGrams - totals.proteinGrams,
        fitnessGoal: requestedGoal,
      });
      const requestedMeal = command.match(/\b(breakfast|lunch|dinner|snack)\b/)?.[1];
      const requestedMealType = requestedMeal === 'snack' ? 'SNACKS' : requestedMeal?.toUpperCase();
      const suggestion = suggestions.find((item) => item.mealType === requestedMealType) || suggestions[0];
      if (!suggestion) {
        return res.json({ response: 'I could not find a meal in your food library that fits your dietary preferences. You can review your nutrition page for available foods.' });
      }
      const goalLabels = {
        WEIGHT_GAIN: 'weight gain',
        WEIGHT_LOSS: 'weight loss',
        MAINTAIN_WEIGHT: 'weight maintenance',
        BUILD_STRENGTH: 'strength building',
      };
      const mealIntroduction = tomorrowMeal ? 'For tomorrow' : `For your ${goalLabels[requestedGoal] || 'fitness'} goal`;
      const mealResponse = `${mealIntroduction}, try ${suggestion.name}. It provides about ${round1(suggestion.nutrition.calories)} calories, ${round1(suggestion.nutrition.proteinGrams)} g protein, ${round1(suggestion.nutrition.carbohydratesGrams)} g carbohydrates, and ${round1(suggestion.nutrition.fatGrams)} g fat. Would you like me to log this meal?`;
      const foodById = new Map(foods.map((food) => [food.id, food]));
      const suggestedItems = suggestion.ingredients.map((item) => {
        const food = foodById.get(item.foodId);
        return {
          ...item,
          nutrition: calculateFoodNutrition(food, item.quantity),
        };
      });
      return res.json({
        response: mealResponse,
        action: {
          type: 'SHOW_MEAL_SUGGESTION',
          mealName: suggestion.name,
          nutrition: suggestion.nutrition,
          mealType: suggestion.mealType,
          date: tomorrowMeal
            ? new Date(new Date(`${today}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            : today,
          items: suggestedItems,
        },
        data: { name: suggestion.name, nutrition: suggestion.nutrition, goal: requestedGoal, ingredients: suggestedItems },
      });
    }

    const muscleExerciseRequest = command.match(/\b(chest|back|legs?|shoulders?|arms?|core)\s+exercises?\b/);
    if (muscleExerciseRequest) {
      const muscleGroup = muscleExerciseRequest[1].startsWith('leg') ? 'Legs'
        : muscleExerciseRequest[1].startsWith('shoulder') ? 'Shoulders'
          : muscleExerciseRequest[1].startsWith('arm') ? 'Arms'
            : `${muscleExerciseRequest[1][0].toUpperCase()}${muscleExerciseRequest[1].slice(1)}`;
      const exercises = (await getVisibleExercises(req.user.id))
        .filter((exercise) => exercise.muscleGroup.toLowerCase() === muscleGroup.toLowerCase())
        .slice(0, 3);
      const names = exercises.map((exercise) => exercise.name);
      return res.json({
        response: names.length
          ? `For ${muscleGroup.toLowerCase()}, try ${names.join(', ')}. Would you like me to open those exercises?`
          : `I could not find any ${muscleGroup.toLowerCase()} exercises in the library yet. Would you like to open the exercise library?`,
        action: { type: 'CONFIRM_NAVIGATION', path: `/app/exercises?muscleGroup=${encodeURIComponent(muscleGroup)}` },
        data: { muscleGroup, exercises: names },
      });
    }

    const exerciseDetailRequest = command.match(/^(?:show|open|find|search for|tell me about|explain|how do i do|how to do)(?: me)?(?: the)? (.+?)(?: exercise)?$/);
    if (exerciseDetailRequest) {
      const requested = exerciseSearchText(exerciseDetailRequest[1]);
      const words = requested.split(' ').map((word) => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);
      const candidates = [...new Set([requested, words.join(' ')].filter(Boolean))];
      const exercises = await getVisibleExercises(req.user.id);
      const exercise = exercises.find((item) => candidates.includes(exerciseSearchText(item.name)))
        || exercises.find((item) => {
          const name = exerciseSearchText(item.name);
          return candidates.some((candidate) => name.includes(candidate) || candidate.includes(name));
        });
      if (!exercise) {
        return res.json({ response: `I could not find ${exerciseDetailRequest[1]} in your exercise library. Try another exercise name or browse the library.` });
      }
      const instructions = exercise.instructions.slice(0, 4).join(' ');
      const article = /^[aeiou]/i.test(exercise.difficulty) ? 'an' : 'a';
      return res.json({
        response: `${exercise.name} is ${article} ${exercise.difficulty.toLowerCase()} movement for your ${exercise.muscleGroup.toLowerCase()} using ${exercise.equipment.toLowerCase()} equipment. ${exercise.description} ${instructions}`.trim(),
        action: {
          type: 'NAVIGATE',
          path: `/app/exercises?search=${encodeURIComponent(exercise.name)}&exercise=${encodeURIComponent(exercise.id)}`,
          exerciseId: exercise.id,
        },
        data: { exercise },
      });
    }

    if (allowAI) return res.json(await optionalAIReply(message));
    return res.json({
      response: 'I did not recognize that command. Try “open dashboard,” “start workout,” “I ate two eggs,” “how much protein is remaining,” or “show my progress.”',
      aiStatus: 'offline',
    });
  } catch (error) {
    return next(error);
  }
}
