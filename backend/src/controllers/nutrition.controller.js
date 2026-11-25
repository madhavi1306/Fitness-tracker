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

