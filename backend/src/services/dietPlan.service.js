import { z } from 'zod';
import { buildMealSuggestions, calculateFoodNutrition } from './nutrition.service.js';

const mealTypes = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];

const nutritionSchema = z.object({
  calories: z.number().finite().min(0),
  proteinGrams: z.number().finite().min(0),
  carbohydratesGrams: z.number().finite().min(0),
  fatGrams: z.number().finite().min(0),
}).strict();

const dietPlanMealSchema = z.object({
  mealType: z.enum(mealTypes),
  name: z.string().trim().min(1).max(200),
  ingredients: z.array(z.object({
    foodId: z.string().min(1).max(100),
    foodName: z.string().trim().min(1).max(100),
    quantity: z.number().finite().min(0.01).max(100),
  }).strict()).min(1).max(12),
  nutrition: nutritionSchema,
}).strict();

export const dietPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goal: z.string().trim().min(1).max(100),
  dietaryPreference: z.enum(['NONE', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'OTHER']),
  targetCalories: z.number().finite().min(800).max(10000),
  targetProteinGrams: z.number().finite().min(20).max(500),
  estimatedCalories: z.number().finite().min(0),
  estimatedProteinGrams: z.number().finite().min(0),
  estimatedCarbsGrams: z.number().finite().min(0),
  estimatedFatGrams: z.number().finite().min(0),
  meals: z.array(dietPlanMealSchema).min(1).max(4),
}).strict();

function round1(value) {
  return Math.round(value * 10) / 10;
}

function requestedPreference(message, fallback) {
  if (/\bvegan\b/i.test(message)) return 'VEGAN';
  if (/\bnon[- ]vegetarian\b/i.test(message)) return 'NONE';
  if (/\bvegetarian\b/i.test(message)) return 'VEGETARIAN';
  if (/\bpescatarian\b/i.test(message)) return 'PESCATARIAN';
  return fallback;
}

function requestedGoal(message, fallback) {
  if (/\b(weight gain|gain weight)\b/i.test(message)) return 'WEIGHT_GAIN';
  if (/\b(weight loss|lose weight|fat loss)\b/i.test(message)) return 'WEIGHT_LOSS';
  if (/\b(build strength|gain muscle|muscle gain|build muscle)\b/i.test(message)) return 'BUILD_STRENGTH';
  return fallback;
}

function targetCaloriesForGoal(goal, target) {
  if (goal === 'WEIGHT_LOSS') return Math.max(1200, target.dailyCalories - 300);
  if (goal === 'WEIGHT_GAIN') return target.dailyCalories + 200;
  return target.dailyCalories;
}

function proteinTargetForRequest(message, user, target) {
  if (!/\bhigh[- ]protein\b/i.test(message)) return target.proteinGrams;
  return Math.min(500, Math.max(target.proteinGrams, Math.round((user.currentWeightKg || 70) * 1.6)));
}

function isAllowedForPreference(food, preference) {
  if (preference === 'VEGAN') return food.dietaryTags.includes('vegan');
  if (preference === 'VEGETARIAN') return food.dietaryTags.includes('vegetarian');
  if (preference === 'PESCATARIAN') {
    return food.dietaryTags.includes('vegetarian') || food.dietaryTags.includes('pescatarian');
  }
  return true;
}

function recalculateMealNutrition(meals, foods) {
  const byId = new Map(foods.map((food) => [food.id, food]));
  for (const meal of meals) {
    meal.nutrition = meal.ingredients.reduce((total, item) => {
      const food = byId.get(item.foodId);
      if (!food) return total;
      const scaled = calculateFoodNutrition(food, item.quantity);
      return {
        calories: round1(total.calories + scaled.calories),
        proteinGrams: round1(total.proteinGrams + scaled.proteinGrams),
        carbohydratesGrams: round1(total.carbohydratesGrams + scaled.carbohydratesGrams),
        fatGrams: round1(total.fatGrams + scaled.fatGrams),
      };
    }, { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });
  }
}

function scaledQuantity(item, food, multiplier) {
  const quantity = item.quantity * multiplier;
  const isWholeServing = /\b(egg|piece|banana|potato|dosa|idli|slice)\b/i.test(food?.servingUnit || '');
  return Math.min(100, Math.max(0.25, isWholeServing
    ? Math.round(quantity)
    : Math.round(quantity * 4) / 4));
}

function scaleMealsToTarget(meals, foods, targetCalories) {
  const currentCalories = meals.reduce((total, meal) => total + meal.nutrition.calories, 0);
  if (currentCalories <= 0) return;
  const multiplier = Math.min(3, Math.max(0.75, targetCalories / currentCalories));
  const byId = new Map(foods.map((food) => [food.id, food]));
  for (const meal of meals) {
    meal.ingredients = meal.ingredients.map((item) => ({
      ...item,
      quantity: scaledQuantity(item, byId.get(item.foodId), multiplier),
    }));
  }
  recalculateMealNutrition(meals, foods);
}

export function generateDietPlan({ message, user, foods, target, date, variation = 0 }) {
  const preference = requestedPreference(message, user.dietaryPreference);
  const goal = requestedGoal(message, user.fitnessGoal);
  const highProtein = /\bhigh[- ]protein\b/i.test(message);
  const targetProteinGrams = proteinTargetForRequest(message, user, target);
  const targetCalories = targetCaloriesForGoal(goal, target);
  const suggestions = buildMealSuggestions(foods, {
    dietaryPreference: preference,
    remainingCalories: targetCalories,
    remainingProtein: targetProteinGrams,
    fitnessGoal: goal,
  });
  if (!suggestions.length) return null;

  const meals = [];
  const byId = new Map(foods.map((food) => [food.id, food]));
  for (const [mealIndex, mealType] of mealTypes.entries()) {
    const choices = suggestions.filter((item) => item.mealType === mealType);
    const best = choices.length
      ? highProtein
        ? choices.reduce((current, choice) => choice.nutrition.proteinGrams > current.nutrition.proteinGrams ? choice : current)
        : choices[(variation + mealIndex) % choices.length]
      : null;
    if (!best) continue;
    const ingredients = best.ingredients.map((item) => ({
      foodId: item.foodId,
      foodName: item.foodName,
      quantity: item.quantity,
    }));
    const nutrition = ingredients.reduce((total, item) => {
      const scaled = calculateFoodNutrition(byId.get(item.foodId), item.quantity);
      return {
        calories: round1(total.calories + scaled.calories),
        proteinGrams: round1(total.proteinGrams + scaled.proteinGrams),
        carbohydratesGrams: round1(total.carbohydratesGrams + scaled.carbohydratesGrams),
        fatGrams: round1(total.fatGrams + scaled.fatGrams),
      };
    }, { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });
    meals.push({ mealType, name: best.name, ingredients, nutrition });
  }
  if (meals.length !== mealTypes.length) return null;

  scaleMealsToTarget(meals, foods, targetCalories);
  const totals = meals.reduce((total, meal) => ({
    calories: round1(total.calories + meal.nutrition.calories),
    proteinGrams: round1(total.proteinGrams + meal.nutrition.proteinGrams),
    carbohydratesGrams: round1(total.carbohydratesGrams + meal.nutrition.carbohydratesGrams),
    fatGrams: round1(total.fatGrams + meal.nutrition.fatGrams),
  }), { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });

  return dietPlanSchema.parse({
    name: `Daily ${goal === 'WEIGHT_LOSS' ? 'weight loss' : goal === 'WEIGHT_GAIN' ? 'weight gain' : goal === 'BUILD_STRENGTH' ? 'muscle gain' : 'balanced'} diet plan`,
    date,
    goal,
    dietaryPreference: preference,
    targetCalories,
    targetProteinGrams,
    estimatedCalories: totals.calories,
    estimatedProteinGrams: totals.proteinGrams,
    estimatedCarbsGrams: totals.carbohydratesGrams,
    estimatedFatGrams: totals.fatGrams,
    meals,
  });
}

export async function generateDietPlanWithProvider({ message, user, foods, target, date, variation = 0 }) {
  const { AI_ENABLED, AI_API_URL, AI_API_KEY, AI_MODEL } = process.env;
  if (AI_ENABLED !== 'true' || !AI_API_URL || !AI_API_KEY || !AI_MODEL) {
    return {
      plan: generateDietPlan({ message, user, foods, target, date, variation }),
      generationMethod: 'database_library',
    };
  }

  let endpoint;
  try {
    endpoint = new URL(AI_API_URL);
  } catch {
    throw new Error('The nutrition AI endpoint URL is invalid.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('The nutrition AI endpoint must use HTTP or HTTPS.');
  }

  const foodCatalog = foods.slice(0, 200).map((food) => ({
    id: food.id,
    name: food.name,
    servingUnit: food.servingUnit,
    servingSize: food.servingSize,
    calories: food.calories,
    proteinGrams: food.proteinGrams,
    carbohydratesGrams: food.carbohydratesGrams,
    fatGrams: food.fatGrams,
    dietaryTags: food.dietaryTags,
  }));
  const prompt = JSON.stringify({
    date,
    request: message,
    profile: {
      age: user.age,
      heightCm: user.heightCm,
      currentWeightKg: user.currentWeightKg,
      fitnessGoal: user.fitnessGoal,
      activityLevel: user.activityLevel,
      dietaryPreference: user.dietaryPreference,
    },
    targets: {
      dailyCalories: target.dailyCalories,
      proteinGrams: target.proteinGrams,
      carbohydratesGrams: target.carbohydratesGrams,
      fatGrams: target.fatGrams,
    },
    foods: foodCatalog,
  });

  let providerResponse;
  try {
    providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Create a practical nutrition plan using only the supplied food catalog. Return JSON only with exactly these keys: name,date,goal,dietaryPreference,targetCalories,targetProteinGrams,estimatedCalories,estimatedProteinGrams,estimatedCarbsGrams,estimatedFatGrams,meals. Meals must contain exactly mealType, name, ingredients, and nutrition. mealType values are BREAKFAST, LUNCH, SNACKS, DINNER. Each ingredient must contain foodId, foodName, quantity. No markdown. Portions must be realistic and values must match the supplied food macros.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2200,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Could not reach the nutrition AI provider.');
  }
  if (!providerResponse.ok) {
    throw new Error(`The nutrition AI provider returned HTTP ${providerResponse.status}.`);
  }

  let payload;
  try {
    payload = await providerResponse.json();
  } catch {
    throw new Error('The nutrition AI provider returned an invalid response.');
  }
  let generated;
  try {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error();
    generated = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
  } catch {
    throw new Error('The nutrition AI provider returned JSON that could not be parsed.');
  }

  const preference = requestedPreference(message, user.dietaryPreference);
  const goal = requestedGoal(message, user.fitnessGoal);
  const targetCalories = targetCaloriesForGoal(goal, target);
  const targetProteinGrams = proteinTargetForRequest(message, user, target);
  const byId = new Map(foods.map((food) => [food.id, food]));
  const normalizedMeals = generated.meals?.map((meal) => {
    const ingredients = meal.ingredients?.map((item) => {
      const food = byId.get(item.foodId) || foods.find((entry) => entry.name.toLowerCase() === String(item.foodName || '').toLowerCase());
      if (!food || !isAllowedForPreference(food, preference)) return null;
      return {
        foodId: food.id,
        foodName: food.name,
        quantity: Math.min(100, Math.max(0.01, Number(item.quantity))),
      };
    }).filter(Boolean);
    if (!ingredients?.length) return null;
    const nutrition = ingredients.reduce((total, item) => {
      const scaled = calculateFoodNutrition(byId.get(item.foodId), item.quantity);
      return {
        calories: round1(total.calories + scaled.calories),
        proteinGrams: round1(total.proteinGrams + scaled.proteinGrams),
        carbohydratesGrams: round1(total.carbohydratesGrams + scaled.carbohydratesGrams),
        fatGrams: round1(total.fatGrams + scaled.fatGrams),
      };
    }, { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });
    return {
      mealType: meal.mealType,
      name: String(meal.name || '').trim().slice(0, 200),
      ingredients,
      nutrition,
    };
  }).filter(Boolean);
  if (!normalizedMeals
    || normalizedMeals.length !== 4
    || new Set(normalizedMeals.map((meal) => meal.mealType)).size !== 4
    || !['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'].every((mealType) => normalizedMeals.some((meal) => meal.mealType === mealType))) {
    throw new Error('The nutrition AI provider did not return all four required meals.');
  }
  scaleMealsToTarget(normalizedMeals, foods, targetCalories);
  const totals = normalizedMeals.reduce((total, meal) => ({
    calories: round1(total.calories + meal.nutrition.calories),
    proteinGrams: round1(total.proteinGrams + meal.nutrition.proteinGrams),
    carbohydratesGrams: round1(total.carbohydratesGrams + meal.nutrition.carbohydratesGrams),
    fatGrams: round1(total.fatGrams + meal.nutrition.fatGrams),
  }), { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });
  const plan = dietPlanSchema.parse({
    name: String(generated.name || 'Personalized nutrition plan').trim().slice(0, 200),
    date,
    goal,
    dietaryPreference: preference,
    targetCalories,
    targetProteinGrams,
    estimatedCalories: totals.calories,
    estimatedProteinGrams: totals.proteinGrams,
    estimatedCarbsGrams: totals.carbohydratesGrams,
    estimatedFatGrams: totals.fatGrams,
    meals: normalizedMeals,
  });
  return { plan, generationMethod: 'ai_provider' };
}

export async function generateDietPlanWeekWithProvider({ message, user, foods, target, date }) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const requests = Array.from({ length: 7 }, (_, variation) => {
    const planDate = new Date(start);
    planDate.setUTCDate(start.getUTCDate() + variation);
    const day = planDate.toISOString().slice(0, 10);
    return generateDietPlanWithProvider({
      message: `${message}. Create a distinct menu for day ${variation + 1} of this seven-day plan.`,
      user,
      foods,
      target,
      date: day,
      variation,
    });
  });
  const generated = await Promise.all(requests);
  return {
    plans: generated.map((item) => item.plan).filter(Boolean),
    generationMethod: generated.every((item) => item.generationMethod === 'ai_provider')
      ? 'ai_provider'
      : 'database_library',
  };
}

export function editDietPlan({ plan, instruction, foods }) {
  const parsed = dietPlanSchema.safeParse(plan);
  if (!parsed.success) return { error: 'I could not validate the current diet plan.' };
  const text = instruction.toLowerCase();
  const current = parsed.data;
  const available = foods.filter((food) => {
    if (current.dietaryPreference === 'VEGAN') return food.dietaryTags.includes('vegan');
    if (current.dietaryPreference === 'VEGETARIAN') return food.dietaryTags.includes('vegetarian');
    if (current.dietaryPreference === 'PESCATARIAN') {
      return food.dietaryTags.includes('vegetarian') || food.dietaryTags.includes('pescatarian');
    }
    return true;
  });
  const requestedMeal = /\b(breakfast|morning snack|lunch|dinner|evening snack|snack)\b/.exec(text)?.[1];
  const mealType = requestedMeal === 'breakfast' ? 'BREAKFAST'
    : requestedMeal === 'lunch' ? 'LUNCH'
      : requestedMeal === 'dinner' ? 'DINNER'
        : requestedMeal ? 'SNACKS' : null;
  const targetMeal = current.meals.find((item) => item.mealType === mealType);

  if (/\b(how much protein|protein total|how many calories|plan calories|plan macros)\b/.test(text)) {
    return {
      response: `Your current plan totals ${current.estimatedCalories} calories, ${current.estimatedProteinGrams} grams of protein, ${current.estimatedCarbsGrams} grams of carbohydrates, and ${current.estimatedFatGrams} grams of fat.`,
    };
  }

  if (/\b(make|add|give).*(higher|more|high).*protein|more protein|high protein\b/.test(text)) {
    const proteinFood = [...available].sort((a, b) => (b.proteinGrams / b.calories) - (a.proteinGrams / a.calories))[0];
    if (!proteinFood) return { error: 'I could not find a suitable protein food in your library.' };
    const meal = targetMeal || current.meals.find((item) => item.mealType === 'SNACKS') || current.meals[0];
    meal.ingredients.push({ foodId: proteinFood.id, foodName: proteinFood.name, quantity: 1 });
  } else if (/\b(?:change|set|make)\s+/.test(text) && /\b\d+(?:\.\d+)?\s+(?:servings?|portions?)\b/.test(text)) {
    const match = text.match(/\b(?:change|set|make)\s+(?:(breakfast|lunch|dinner|snack)\s+)?(.+?)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s+(?:servings?|portions?)\b/);
    if (!match) return { error: 'Tell me the food and new serving quantity, for example “set oats to 2 servings.”' };
    const requestedType = match[1] === 'breakfast' ? 'BREAKFAST'
      : match[1] === 'lunch' ? 'LUNCH'
        : match[1] === 'dinner' ? 'DINNER'
          : match[1] ? 'SNACKS' : null;
    const requestedFoodName = match[2].replace(/^(?:the|my)\s+/, '').trim();
    const quantity = Number(match[3]);
    if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > 100) {
      return { error: 'A portion must be between 0.01 and 100 servings.' };
    }
    const ingredient = current.meals
      .filter((meal) => !requestedType || meal.mealType === requestedType)
      .flatMap((meal) => meal.ingredients)
      .find((item) => item.foodName.toLowerCase() === requestedFoodName);
    if (!ingredient) return { error: `I could not find ${requestedFoodName} in that meal plan.` };
    ingredient.quantity = quantity;
  } else if (/\breplace (breakfast|morning snack|lunch|dinner|evening snack|snack)\b/.test(text)
    && !/\b(?:replace|change) (breakfast|morning snack|lunch|dinner|evening snack|snack) with\b/.test(text)) {
    const mealName = text.match(/\breplace (breakfast|morning snack|lunch|dinner|evening snack|snack)\b/)?.[1];
    const selectedType = mealName === 'breakfast' ? 'BREAKFAST'
      : mealName === 'lunch' ? 'LUNCH'
        : mealName === 'dinner' ? 'DINNER'
          : 'SNACKS';
    const existing = current.meals.find((item) => item.mealType === selectedType);
    if (!existing) return { error: 'That meal is not present in the current plan.' };
    const suggestions = buildMealSuggestions(foods, {
      dietaryPreference: current.dietaryPreference,
      remainingCalories: current.targetCalories,
      remainingProtein: current.targetProteinGrams,
      fitnessGoal: current.goal,
    }).filter((item) => item.mealType === selectedType && item.name !== existing.name);
    if (!suggestions.length) return { error: 'I could not find a different suitable meal in your food library.' };
    const replacement = suggestions[0];
    existing.name = replacement.name;
    existing.ingredients = replacement.ingredients.map((item) => ({
      foodId: item.foodId,
      foodName: item.foodName,
      quantity: item.quantity,
    }));
  } else if (/\b(replace|change) (breakfast|morning snack|lunch|dinner|evening snack|snack) with\b/.test(text)) {
    const match = text.match(/\b(?:replace|change) (breakfast|morning snack|lunch|dinner|evening snack|snack) with (.+)$/);
    if (!match) return { error: 'Tell me which food you would like to use for that meal.' };
    const selectedType = match[1] === 'breakfast' ? 'BREAKFAST'
      : match[1] === 'lunch' ? 'LUNCH'
        : match[1] === 'dinner' ? 'DINNER'
          : 'SNACKS';
    const meal = current.meals.find((item) => item.mealType === selectedType);
    const requestedFood = available.find((food) => food.name.toLowerCase() === match[2].trim());
    if (!meal || !requestedFood) return { error: 'I could not find that food in your library to replace the meal.' };
    meal.name = requestedFood.name;
    meal.ingredients = [{ foodId: requestedFood.id, foodName: requestedFood.name, quantity: 1 }];
  } else if (/\b(reduce|lower) (the )?(calories|calorie)/.test(text)) {
    current.targetCalories = Math.max(800, current.targetCalories - 300);
  } else if (/\b(vegetarian|vegan)\b/.test(text)) {
    const preference = /\bvegan\b/.test(text) ? 'VEGAN' : 'VEGETARIAN';
    const allowedFoods = foods.filter((food) => preference === 'VEGAN'
      ? food.dietaryTags.includes('vegan')
      : food.dietaryTags.includes('vegetarian'));
    const byId = new Map(allowedFoods.map((food) => [food.id, food]));
    for (const meal of current.meals) {
      if (meal.ingredients.every((item) => byId.has(item.foodId))) continue;
      const replacement = buildMealSuggestions(allowedFoods, {
        dietaryPreference: preference,
        remainingCalories: current.targetCalories,
        remainingProtein: current.targetProteinGrams,
        fitnessGoal: current.goal,
      }).find((suggestion) => suggestion.mealType === meal.mealType
        && !current.meals.some((other) => other !== meal && other.name === suggestion.name));
      if (!replacement) return { error: `I could not find a suitable ${meal.mealType.toLowerCase()} replacement for your ${preference.toLowerCase()} plan.` };
      meal.name = replacement.name;
      meal.ingredients = replacement.ingredients.map((item) => ({
        foodId: item.foodId,
        foodName: item.foodName,
        quantity: item.quantity,
      }));
    }
    current.dietaryPreference = preference;
  } else {
    return null;
  }

  for (const meal of current.meals) {
    meal.nutrition = meal.ingredients.reduce((total, item) => {
      const food = foods.find((entry) => entry.id === item.foodId);
      if (!food) return total;
      const scaled = calculateFoodNutrition(food, item.quantity);
      return {
        calories: round1(total.calories + scaled.calories),
        proteinGrams: round1(total.proteinGrams + scaled.proteinGrams),
        carbohydratesGrams: round1(total.carbohydratesGrams + scaled.carbohydratesGrams),
        fatGrams: round1(total.fatGrams + scaled.fatGrams),
      };
    }, { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });
  }
  current.estimatedCalories = round1(current.meals.reduce((total, meal) => total + meal.nutrition.calories, 0));
  current.estimatedProteinGrams = round1(current.meals.reduce((total, meal) => total + meal.nutrition.proteinGrams, 0));
  current.estimatedCarbsGrams = round1(current.meals.reduce((total, meal) => total + meal.nutrition.carbohydratesGrams, 0));
  current.estimatedFatGrams = round1(current.meals.reduce((total, meal) => total + meal.nutrition.fatGrams, 0));
  return { plan: dietPlanSchema.parse(current), response: 'I updated the diet plan. Review the totals before saving.' };
}
