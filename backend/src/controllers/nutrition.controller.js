import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import {
  buildMealSuggestions,
  calculateFoodNutrition,
  createNutritionTarget,
  estimateNutritionTargets,
  suggestFoods,
  summarizeFoodLogs,
} from '../services/nutrition.service.js';
import {
  customFoodSchema,
  foodEntrySchema,
  foodEntryUpdateSchema,
  isRealNutritionDate,
  nutritionTargetSchema,
} from '../utils/nutritionValidation.js';
import {
  dietPlanSchema,
  generateDietPlanWeekWithProvider,
  generateDietPlanWithProvider,
} from '../services/dietPlan.service.js';

const searchSchema = z.string().trim().max(100);

function invalid(res, parsed, message = 'Please check the highlighted fields') {
  return res.status(400).json({
    error: message,
    details: parsed.error.flatten().fieldErrors,
  });
}

function dateBounds(dateString) {
  return {
    start: new Date(`${dateString}T00:00:00.000Z`),
    end: new Date(`${dateString}T23:59:59.999Z`),
  };
}

function logDate(dateString) {
  return dateString ? new Date(`${dateString}T12:00:00.000Z`) : new Date();
}

function targetData(target) {
  return {
    maintenanceCalories: target.maintenanceCalories,
    dailyCalories: target.dailyCalories,
    proteinGrams: target.proteinGrams,
    carbohydratesGrams: target.carbohydratesGrams,
    fatGrams: target.fatGrams,
    isCustom: target.isCustom,
  };
}

async function getOrCreateTarget(user) {
  const existing = await prisma.nutritionTarget.findUnique({ where: { ownerId: user.id } });
  const estimated = estimateNutritionTargets(user);
  if (existing?.isCustom) {
    if (existing.maintenanceCalories === estimated.maintenanceCalories) return existing;
    return prisma.nutritionTarget.update({
      where: { ownerId: user.id },
      data: { maintenanceCalories: estimated.maintenanceCalories },
    });
  }

  return prisma.nutritionTarget.upsert({
    where: { ownerId: user.id },
    create: { ownerId: user.id, ...targetData(estimated) },
    update: targetData(estimated),
  });
}

async function getVisibleFoods(ownerId, search) {
  const where = {
    AND: [
      { OR: [{ ownerId: null }, { ownerId }] },
      ...(search ? [{ name: { contains: search, mode: 'insensitive' } }] : []),
    ],
  };
  return prisma.food.findMany({ where, orderBy: { name: 'asc' }, take: 200 });
}

async function getVisibleFood(id, ownerId) {
  return prisma.food.findFirst({
    where: { id, OR: [{ ownerId: null }, { ownerId }] },
  });
}

export async function listFoods(req, res, next) {
  const parsedSearch = searchSchema.safeParse(req.query.search ?? '');
  if (!parsedSearch.success) return invalid(res, parsedSearch, 'Search must be 100 characters or fewer');
  try {
    const foods = await getVisibleFoods(req.user.id, parsedSearch.data);
    return res.json({ foods: foods.map((food) => ({ ...food, isCustom: Boolean(food.ownerId) })) });
  } catch (error) {
    return next(error);
  }
}

export async function createCustomFood(req, res, next) {
  const parsed = customFoodSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const duplicate = await prisma.food.findFirst({
      where: {
        name: { equals: parsed.data.name, mode: 'insensitive' },
        OR: [{ ownerId: null }, { ownerId: req.user.id }],
      },
    });
    if (duplicate) {
      return res.status(409).json({ error: 'A food with that name is already in your food library' });
    }
    const food = await prisma.food.create({
      data: { ...parsed.data, ownerId: req.user.id },
    });
    return res.status(201).json({ food: { ...food, isCustom: true } });
  } catch (error) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'You already have a custom food with that name' });
    return next(error);
  }
}

async function getTargetResponse(user, overrides) {
  const target = createNutritionTarget(user, overrides);
  if (!target) return null;
  const stored = await prisma.nutritionTarget.upsert({
    where: { ownerId: user.id },
    create: { ownerId: user.id, ...targetData(target) },
    update: targetData(target),
  });
  return {
    ...targetData(stored),
    estimateDisclaimer: target.estimateDisclaimer,
    professionalGuidanceRecommended: target.professionalGuidanceRecommended,
  };
}

export async function getNutritionTargets(req, res, next) {
  try {
    const target = await getOrCreateTarget(req.user);
    const estimate = estimateNutritionTargets(req.user);
    return res.json({
      target: {
        ...targetData(target),
        estimateDisclaimer: estimate.estimateDisclaimer,
        professionalGuidanceRecommended: estimate.professionalGuidanceRecommended,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function saveNutritionTargets(req, res, next) {
  const parsed = nutritionTargetSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed, 'Enter safe nutrition target values');
  try {
    const target = await getTargetResponse(req.user, parsed.data);
    if (!target) return res.status(400).json({ error: 'Macro targets exceed the daily calorie target' });
    return res.json({ target });
  } catch (error) {
    return next(error);
  }
}

export async function getNutritionToday(req, res, next) {
  const date = req.query.date ?? new Date().toISOString().slice(0, 10);
  if (typeof date !== 'string' || !isRealNutritionDate(date)) {
    return res.status(400).json({ error: 'Date must be a real date in YYYY-MM-DD format' });
  }
  try {
    const { start, end } = dateBounds(date);
    const [logs, target, foods] = await Promise.all([
      prisma.foodLog.findMany({
        where: { ownerId: req.user.id, loggedAt: { gte: start, lte: end } },
        orderBy: { loggedAt: 'desc' },
      }),
      getOrCreateTarget(req.user),
      getVisibleFoods(req.user.id, ''),
    ]);
    const totals = summarizeFoodLogs(logs);
    const estimate = estimateNutritionTargets(req.user);
    const remaining = {
      calories: target.dailyCalories - totals.calories,
      proteinGrams: target.proteinGrams - totals.proteinGrams,
      carbohydratesGrams: target.carbohydratesGrams - totals.carbohydratesGrams,
      fatGrams: target.fatGrams - totals.fatGrams,
    };
    return res.json({
      date,
      logs,
      totals,
      target: {
        ...targetData(target),
        estimateDisclaimer: estimate.estimateDisclaimer,
        professionalGuidanceRecommended: estimate.professionalGuidanceRecommended,
      },
      remaining,
      profile: {
        fitnessGoal: req.user.fitnessGoal,
        dietaryPreference: req.user.dietaryPreference,
        age: req.user.age,
        heightCm: req.user.heightCm,
        currentWeightKg: req.user.currentWeightKg,
        startingWeightKg: req.user.startingWeightKg,
        targetWeightKg: req.user.targetWeightKg,
      },
      suggestions: suggestFoods(foods, {
        dietaryPreference: req.user.dietaryPreference,
        remainingCalories: remaining.calories,
        remainingProtein: remaining.proteinGrams,
        fitnessGoal: req.user.fitnessGoal,
      }),
      mealSuggestions: buildMealSuggestions(foods, {
        dietaryPreference: req.user.dietaryPreference,
        remainingCalories: remaining.calories,
        remainingProtein: remaining.proteinGrams,
        fitnessGoal: req.user.fitnessGoal,
      }),
    });
  } catch (error) {
    return next(error);
  }
}

export async function addFoodLog(req, res, next) {
  const parsed = foodEntrySchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed, 'Enter a valid food, quantity, and meal');
  try {
    const food = await getVisibleFood(parsed.data.foodId, req.user.id);
    if (!food) return res.status(404).json({ error: 'Food not found in your food library' });
    const nutrition = calculateFoodNutrition(food, parsed.data.quantity);
    const entry = await prisma.foodLog.create({
      data: {
        ownerId: req.user.id,
        foodId: food.id,
        foodName: food.name,
        servingUnit: food.servingUnit,
        servingSize: food.servingSize,
        quantity: parsed.data.quantity,
        mealType: parsed.data.mealType,
        ...nutrition,
        loggedAt: logDate(parsed.data.date),
      },
    });
    return res.status(201).json({ entry });
  } catch (error) {
    return next(error);
  }
}

export async function updateFoodLog(req, res, next) {
  const parsed = foodEntryUpdateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed, 'Enter valid food log changes');
  try {
    const existing = await prisma.foodLog.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Food log entry not found' });

    const foodId = parsed.data.foodId ?? existing.foodId;
    const quantity = parsed.data.quantity ?? existing.quantity;
    const food = foodId ? await getVisibleFood(foodId, req.user.id) : null;
    if (foodId && !food) return res.status(404).json({ error: 'Food not found in your food library' });
    if ((parsed.data.foodId || parsed.data.quantity !== undefined) && !food) {
      return res.status(409).json({ error: 'Select an available food before changing its quantity' });
    }

    const nutrition = food ? calculateFoodNutrition(food, quantity) : {};
    const entry = await prisma.foodLog.update({
      where: { id: existing.id },
      data: {
        ...(food ? {
          foodId: food.id,
          foodName: food.name,
          servingUnit: food.servingUnit,
          servingSize: food.servingSize,
          quantity,
          ...nutrition,
        } : {}),
        ...(parsed.data.mealType ? { mealType: parsed.data.mealType } : {}),
        ...(parsed.data.date ? { loggedAt: logDate(parsed.data.date) } : {}),
      },
    });
    return res.json({ entry });
  } catch (error) {
    return next(error);
  }
}

export async function deleteFoodLog(req, res, next) {
  try {
    const existing = await prisma.foodLog.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Food log entry not found' });
    await prisma.foodLog.delete({ where: { id: existing.id } });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

const generateDietPlanRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  goal: z.enum(['WEIGHT_GAIN', 'WEIGHT_LOSS', 'MAINTAIN_WEIGHT', 'BUILD_STRENGTH']).optional(),
  dietaryPreference: z.enum(['NONE', 'VEGAN', 'VEGETARIAN', 'PESCATARIAN', 'OTHER']).optional(),
  request: z.string().trim().max(300).optional(),
}).strict();

export async function generateDietPlanRequest(req, res, next) {
  const parsed = generateDietPlanRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed, 'Enter a valid nutrition plan request');
  const date = parsed.data.date || new Date().toISOString().slice(0, 10);
  if (!isRealNutritionDate(date)) return res.status(400).json({ error: 'Date must be a real date in YYYY-MM-DD format' });
  try {
    const [foods, target] = await Promise.all([
      getVisibleFoods(req.user.id, ''),
      getOrCreateTarget(req.user),
    ]);
    const message = parsed.data.request
      || [
        'create a nutrition plan',
        parsed.data.goal ? `for ${parsed.data.goal.replace('_', ' ').toLowerCase()}` : '',
        parsed.data.dietaryPreference ? `for ${parsed.data.dietaryPreference.toLowerCase().replace('_', ' ')}` : '',
      ].filter(Boolean).join(' ');
    const generated = await generateDietPlanWithProvider({
      message,
      user: {
        ...req.user,
        fitnessGoal: parsed.data.goal || req.user.fitnessGoal,
        dietaryPreference: parsed.data.dietaryPreference || req.user.dietaryPreference,
      },
      foods,
      target,
      date,
    });
    let plan = generated.plan;
    if (!plan) return res.status(422).json({ error: 'No complete meal combination could be generated from the available food library.' });
    if (parsed.data.goal) plan.goal = parsed.data.goal;
    plan = dietPlanSchema.parse(plan);
    const { start, end } = dateBounds(date);
    const consumed = summarizeFoodLogs(await prisma.foodLog.findMany({
      where: { ownerId: req.user.id, loggedAt: { gte: start, lte: end } },
    }));
    return res.json({
      plan,
      balance: {
        dailyCaloriesTarget: target.dailyCalories,
        proteinTargetGrams: target.proteinGrams,
        consumedCalories: consumed.calories,
        consumedProteinGrams: consumed.proteinGrams,
        remainingCalories: Math.round((target.dailyCalories - consumed.calories - plan.estimatedCalories) * 10) / 10,
        remainingProteinGrams: Math.round((target.proteinGrams - consumed.proteinGrams - plan.estimatedProteinGrams) * 10) / 10,
      },
      generationMethod: generated.generationMethod,
      note: generated.generationMethod === 'ai_provider'
        ? 'Generated with the configured AI provider and reconciled against the actual food database.'
        : 'Generated from the authenticated user profile and actual food database. No external AI key is required.',
    });
  } catch (error) {
    return next(error);
  }
}

export async function generateDietPlanWeekRequest(req, res, next) {
  const parsed = generateDietPlanRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed, 'Enter a valid weekly nutrition plan request');
  const date = parsed.data.date || new Date().toISOString().slice(0, 10);
  if (!isRealNutritionDate(date)) return res.status(400).json({ error: 'Date must be a real date in YYYY-MM-DD format' });
  try {
    const [foods, target] = await Promise.all([
      getVisibleFoods(req.user.id, ''),
      getOrCreateTarget(req.user),
    ]);
    const message = parsed.data.request || 'Create a practical seven-day nutrition plan';
    const generated = await generateDietPlanWeekWithProvider({
      message,
      user: {
        ...req.user,
        fitnessGoal: parsed.data.goal || req.user.fitnessGoal,
        dietaryPreference: parsed.data.dietaryPreference || req.user.dietaryPreference,
      },
      foods,
      target,
      date,
    });
    if (generated.plans.length !== 7) {
      return res.status(422).json({ error: 'A complete seven-day plan could not be generated from the available food library.' });
    }
    return res.json({
      plans: generated.plans,
      generationMethod: generated.generationMethod,
      note: generated.generationMethod === 'ai_provider'
        ? 'Each day was generated with the configured provider and reconciled against the food database.'
        : 'Seven daily plans were generated from your profile and actual food database. No external AI key is required.',
    });
  } catch (error) {
    return next(error);
  }
}

export async function listDietPlans(req, res, next) {
  try {
    const plans = await prisma.dietPlan.findMany({
      where: { ownerId: req.user.id },
      include: { meals: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return res.json({ plans });
  } catch (error) {
    return next(error);
  }
}

export async function getDietPlan(req, res, next) {
  try {
    const plan = await prisma.dietPlan.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      include: { meals: true },
    });
    if (!plan) return res.status(404).json({ error: 'Diet plan not found' });
    return res.json({ plan });
  } catch (error) {
    return next(error);
  }
}

function dietPlanFields(plan, replaceMeals = false) {
  return {
    name: plan.name,
    goal: plan.goal,
    dietaryPreference: plan.dietaryPreference,
    estimatedCalories: plan.estimatedCalories,
    estimatedProteinGrams: plan.estimatedProteinGrams,
    estimatedCarbsGrams: plan.estimatedCarbsGrams,
    estimatedFatGrams: plan.estimatedFatGrams,
    meals: {
      ...(replaceMeals ? { deleteMany: {} } : {}),
      create: plan.meals.map((meal) => ({
        mealType: meal.mealType,
        name: meal.name,
        ingredients: meal.ingredients,
        nutrition: meal.nutrition,
      })),
    },
  };
}

async function saveDietPlanRecord(transaction, ownerId, plan) {
  const date = new Date(`${plan.date}T00:00:00.000Z`);
  const existing = await transaction.dietPlan.findFirst({
    where: { ownerId, date },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (existing) {
    return {
      created: false,
      plan: await transaction.dietPlan.update({
        where: { id: existing.id },
        data: dietPlanFields(plan, true),
        include: { meals: true },
      }),
    };
  }
  return {
    created: true,
    plan: await transaction.dietPlan.create({
      data: { ownerId, date, ...dietPlanFields(plan) },
      include: { meals: true },
    }),
  };
}

export async function saveDietPlan(req, res, next) {
  const parsed = dietPlanSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed, 'Enter a valid diet plan');
  try {
    const saved = await prisma.$transaction((transaction) => saveDietPlanRecord(transaction, req.user.id, parsed.data));
    return res.status(saved.created ? 201 : 200).json({ plan: saved.plan });
  } catch (error) {
    return next(error);
  }
}

const dietPlanBatchSchema = z.object({
  plans: z.array(dietPlanSchema).length(7),
}).strict().refine(({ plans }) => new Set(plans.map((plan) => plan.date)).size === 7, {
  message: 'A weekly plan must contain seven different dates',
  path: ['plans'],
});

export async function saveDietPlanBatch(req, res, next) {
  const parsed = dietPlanBatchSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed, 'Enter seven valid daily plans with distinct dates');
  try {
    const saved = await prisma.$transaction((transaction) => Promise.all(
      parsed.data.plans.map((plan) => saveDietPlanRecord(transaction, req.user.id, plan)),
    ));
    return res.status(saved.some((result) => result.created) ? 201 : 200)
      .json({ plans: saved.map((result) => result.plan) });
  } catch (error) {
    return next(error);
  }
}

export async function deleteDietPlan(req, res, next) {
  try {
    const plan = await prisma.dietPlan.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
      select: { id: true },
    });
    if (!plan) return res.status(404).json({ error: 'Diet plan not found' });
    await prisma.dietPlan.delete({ where: { id: plan.id } });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

export async function getNutritionHistory(req, res, next) {
  let from = req.query.from;
  let to = req.query.to;
  if (from && (typeof from !== 'string' || !isRealNutritionDate(from))) {
    return res.status(400).json({ error: 'From must be a real date in YYYY-MM-DD format' });
  }
  if (to && (typeof to !== 'string' || !isRealNutritionDate(to))) {
    return res.status(400).json({ error: 'To must be a real date in YYYY-MM-DD format' });
  }
  if (!from && !to) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 29);
    from = start.toISOString().slice(0, 10);
    to = new Date().toISOString().slice(0, 10);
  }
  if (from && to && from > to) return res.status(400).json({ error: 'From date must be on or before to date' });

  try {
    const start = dateBounds(from || '1970-01-01').start;
    const end = dateBounds(to || new Date().toISOString().slice(0, 10)).end;
    const logs = await prisma.foodLog.findMany({
      where: { ownerId: req.user.id, loggedAt: { gte: start, lte: end } },
      orderBy: { loggedAt: 'desc' },
    });
    const days = logs.reduce((groups, log) => {
      const date = new Date(log.loggedAt).toISOString().slice(0, 10);
      (groups[date] ||= []).push(log);
      return groups;
    }, {});
    return res.json({
      from: from || null,
      to: to || null,
      logs,
      days: Object.entries(days).map(([date, entries]) => ({
        date,
        entries,
        totals: summarizeFoodLogs(entries),
      })),
    });
  } catch (error) {
    return next(error);
  }
}

