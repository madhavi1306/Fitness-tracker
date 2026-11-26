import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDietPlan, generateDietPlanWithProvider, editDietPlan } from '../src/services/dietPlan.service.js';

const foods = [
  { id: 'oats', name: 'Oats', dietaryTags: ['vegetarian', 'vegan'], calories: 389, proteinGrams: 16.9, carbohydratesGrams: 66, fatGrams: 7 },
  { id: 'milk', name: 'Milk', dietaryTags: ['vegetarian'], calories: 150, proteinGrams: 8, carbohydratesGrams: 12, fatGrams: 8 },
  { id: 'banana', name: 'Banana', dietaryTags: ['vegetarian', 'vegan'], calories: 105, proteinGrams: 1.3, carbohydratesGrams: 27, fatGrams: 0.4 },
  { id: 'egg', name: 'Egg', servingUnit: 'large egg', dietaryTags: ['pescatarian'], calories: 72, proteinGrams: 6.3, carbohydratesGrams: 0.4, fatGrams: 4.8 },
  { id: 'chapati', name: 'Chapati', servingUnit: 'piece', dietaryTags: ['vegetarian', 'vegan'], calories: 120, proteinGrams: 4, carbohydratesGrams: 20, fatGrams: 3 },
  { id: 'paneer', name: 'Paneer', dietaryTags: ['vegetarian'], calories: 265, proteinGrams: 18, carbohydratesGrams: 6, fatGrams: 20 },
  { id: 'tofu', name: 'Tofu', dietaryTags: ['vegetarian', 'vegan'], calories: 144, proteinGrams: 17, carbohydratesGrams: 3, fatGrams: 9 },
  { id: 'curd', name: 'Curd', dietaryTags: ['vegetarian'], calories: 98, proteinGrams: 11, carbohydratesGrams: 3.4, fatGrams: 4 },
  { id: 'dal', name: 'Dal', dietaryTags: ['vegetarian', 'vegan'], calories: 230, proteinGrams: 18, carbohydratesGrams: 40, fatGrams: 3 },
  { id: 'rice', name: 'Cooked Rice', dietaryTags: ['vegetarian', 'vegan'], calories: 205, proteinGrams: 4, carbohydratesGrams: 45, fatGrams: 0.4 },
  { id: 'vegetables', name: 'Mixed Vegetables', dietaryTags: ['vegetarian', 'vegan'], calories: 80, proteinGrams: 3, carbohydratesGrams: 14, fatGrams: 1 },
  { id: 'chickpeas', name: 'Chickpeas', dietaryTags: ['vegetarian', 'vegan'], calories: 269, proteinGrams: 15, carbohydratesGrams: 45, fatGrams: 4 },
  { id: 'chicken', name: 'Cooked Chicken Breast', dietaryTags: [], calories: 165, proteinGrams: 31, carbohydratesGrams: 0, fatGrams: 3.6 },
];

test('diet plan generation and replacement remain validated and preference-safe', () => {
  const plan = generateDietPlan({
    message: 'Create a vegetarian diet plan for weight gain',
    user: { fitnessGoal: 'WEIGHT_GAIN', dietaryPreference: 'VEGETARIAN' },
    foods,
    target: { dailyCalories: 2400, proteinGrams: 112 },
    date: '2026-11-26',
  });
  assert.ok(plan);
  assert.equal(plan.dietaryPreference, 'VEGETARIAN');
  assert.equal(plan.meals.length, 4);
  assert.ok(plan.meals.every((meal) => meal.nutrition.calories >= 0));
  assert.ok(plan.estimatedCalories >= plan.targetCalories * 0.85);
  assert.ok(plan.estimatedCalories <= plan.targetCalories * 1.1);

  const muscleGainPlan = generateDietPlan({
    message: 'Create a muscle gain diet plan',
    user: { fitnessGoal: 'MAINTAIN_WEIGHT', dietaryPreference: 'VEGETARIAN', currentWeightKg: 72 },
    foods,
    target: { dailyCalories: 2200, proteinGrams: 100 },
    date: '2026-11-26',
  });
  assert.equal(muscleGainPlan.goal, 'BUILD_STRENGTH');

  const highProteinPlan = generateDietPlan({
    message: 'Give me a high-protein diet plan',
    user: { fitnessGoal: 'MAINTAIN_WEIGHT', dietaryPreference: 'VEGETARIAN', currentWeightKg: 72 },
    foods,
    target: { dailyCalories: 2200, proteinGrams: 100 },
    date: '2026-11-26',
  });
  assert.equal(highProteinPlan.targetProteinGrams, 115);

  const nonVegetarianPlan = generateDietPlan({
    message: 'Give me a non-vegetarian diet plan',
    user: { fitnessGoal: 'MAINTAIN_WEIGHT', dietaryPreference: 'VEGETARIAN' },
    foods,
    target: { dailyCalories: 2200, proteinGrams: 100 },
    date: '2026-11-26',
  });
  assert.equal(nonVegetarianPlan.dietaryPreference, 'NONE');
  assert.ok(nonVegetarianPlan.meals.some((meal) => meal.ingredients.some((item) => item.foodId === 'chicken')));
  const eggServing = nonVegetarianPlan.meals
    .flatMap((meal) => meal.ingredients)
    .find((item) => item.foodId === 'egg');
  assert.ok(eggServing);
  assert.ok(Number.isInteger(eggServing.quantity));

  const replaced = editDietPlan({
    plan,
    instruction: 'Replace dinner',
    foods,
  });
  assert.equal(replaced.error, undefined);
  assert.ok(replaced.plan.meals.find((meal) => meal.mealType === 'DINNER'));

  const breakfast = plan.meals.find((meal) => meal.mealType === 'BREAKFAST');
  const higherProtein = editDietPlan({
    plan,
    instruction: 'Make breakfast higher in protein',
    foods,
  });
  assert.ok(higherProtein.plan.meals.find((meal) => meal.mealType === 'BREAKFAST').nutrition.proteinGrams > breakfast.nutrition.proteinGrams);

  const totals = editDietPlan({
    plan,
    instruction: 'How much protein does my plan have?',
    foods,
  });
  assert.match(totals.response, new RegExp(`${plan.estimatedProteinGrams} grams of protein`));
  assert.equal(totals.plan, undefined);

  const dinnerWithPaneer = editDietPlan({
    plan,
    instruction: 'Replace dinner with paneer',
    foods,
  });
  assert.equal(dinnerWithPaneer.plan.meals.find((meal) => meal.mealType === 'DINNER').name, 'Paneer');

  const adjustedPortion = editDietPlan({
    plan,
    instruction: 'Set oats to 2 servings',
    foods,
  });
  assert.equal(adjustedPortion.plan.meals
    .find((meal) => meal.mealType === 'BREAKFAST')
    .ingredients.find((item) => item.foodId === 'oats').quantity, 2);
});

test('configured AI plans are parsed and rejected when they violate dietary preferences', async () => {
  const previousEnvironment = {
    AI_ENABLED: process.env.AI_ENABLED,
    AI_API_URL: process.env.AI_API_URL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  };
  const previousFetch = globalThis.fetch;
  const user = { fitnessGoal: 'MAINTAIN_WEIGHT', dietaryPreference: 'VEGETARIAN', currentWeightKg: 72 };
  const target = { dailyCalories: 2200, proteinGrams: 100 };
  const date = '2026-11-26';
  const plan = generateDietPlan({
    message: 'Create a vegetarian diet plan',
    user,
    foods,
    target,
    date,
  });
  let content = JSON.stringify(plan);
  process.env.AI_ENABLED = 'true';
  process.env.AI_API_URL = 'https://provider.example/v1/chat/completions';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });

  try {
    const result = await generateDietPlanWithProvider({
      message: 'Create a vegetarian diet plan',
      user,
      foods,
      target,
      date,
    });
    assert.equal(result.generationMethod, 'ai_provider');
    assert.ok(result.plan.meals.every((meal) => meal.ingredients.every((item) => item.foodId !== 'chicken')));

    const incompatiblePlan = structuredClone(plan);
    incompatiblePlan.meals[0].ingredients = [{ foodId: 'chicken', foodName: 'Cooked Chicken Breast', quantity: 1 }];
    content = JSON.stringify(incompatiblePlan);
    await assert.rejects(
      generateDietPlanWithProvider({ message: 'Create a vegetarian diet plan', user, foods, target, date }),
      /did not return all four required meals/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
