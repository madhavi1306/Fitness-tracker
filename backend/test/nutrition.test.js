import test from 'node:test';
import assert from 'node:assert/strict';
import { seedFoods } from '../src/data/foods.js';
import {
  buildMealSuggestions,
  calculateFoodNutrition,
  createNutritionTarget,
  estimateNutritionTargets,
  summarizeFoodLogs,
  suggestFoods,
} from '../src/services/nutrition.service.js';
import {
  customFoodSchema,
  foodEntrySchema,
  foodEntryUpdateSchema,
  nutritionTargetSchema,
} from '../src/utils/nutritionValidation.js';

const profile = {
  age: 29,
  heightCm: 173,
  currentWeightKg: 76,
  activityLevel: 'MODERATELY_ACTIVE',
  fitnessGoal: 'WEIGHT_LOSS',
  dietaryPreference: 'VEGETARIAN',
};

test('nutrition targets use age, height, weight, activity, and goal with a modest calorie adjustment', () => {
  const loss = estimateNutritionTargets(profile);
  const maintain = estimateNutritionTargets({ ...profile, fitnessGoal: 'MAINTAIN_WEIGHT' });
  const gain = estimateNutritionTargets({ ...profile, fitnessGoal: 'WEIGHT_GAIN' });
  const strength = estimateNutritionTargets({ ...profile, fitnessGoal: 'BUILD_STRENGTH' });

  assert.ok(loss.maintenanceCalories > 0);
  assert.equal(maintain.dailyCalories, maintain.maintenanceCalories);
  assert.equal(maintain.dailyCalories - loss.dailyCalories, 300);
  assert.equal(gain.dailyCalories - gain.maintenanceCalories, 200);
  assert.equal(strength.dailyCalories - strength.maintenanceCalories, 100);
  assert.ok(strength.proteinGrams > maintain.proteinGrams);
  assert.ok(loss.proteinGrams > maintain.proteinGrams);
  assert.ok(loss.carbohydratesGrams >= 0);
  assert.ok(loss.fatGrams > 0);
  assert.match(loss.estimateDisclaimer, /not medical advice/i);
});

test('under-18 users get no goal-based calorie reduction and a professional-guidance note', () => {
  const target = estimateNutritionTargets({ ...profile, age: 16 });
  assert.equal(target.dailyCalories, target.maintenanceCalories);
  assert.equal(target.professionalGuidanceRecommended, true);
});

test('food quantity scaling and daily totals match the two-eggs, two-chapatis, one-dal example', () => {
  const egg = seedFoods.find((food) => food.name === 'Egg');
  const chapati = seedFoods.find((food) => food.name === 'Chapati');
  const dal = seedFoods.find((food) => food.name === 'Dal');
  const entries = [
    { ...calculateFoodNutrition(egg, 2) },
    { ...calculateFoodNutrition(chapati, 2) },
    { ...calculateFoodNutrition(dal, 1) },
  ];
  assert.deepEqual(summarizeFoodLogs(entries), {
    calories: 564,
    proteinGrams: 29.6,
    carbohydratesGrams: 62.8,
    fatGrams: 20.6,
  });
});

test('custom targets reject macros that exceed calories and calculate omitted carbs', () => {
  const target = createNutritionTarget(profile, { dailyCalories: 2200, proteinGrams: 120 });
  assert.equal(target.isCustom, true);
  assert.ok(target.carbohydratesGrams > 0);
  assert.equal(createNutritionTarget(profile, {
    dailyCalories: 1200,
    proteinGrams: 300,
    carbohydratesGrams: 500,
    fatGrams: 200,
  }), null);
});

test('food suggestions respect dietary preferences and favor protein when needed', () => {
  const suggestions = suggestFoods(seedFoods, {
    dietaryPreference: 'VEGETARIAN',
    remainingCalories: 500,
    remainingProtein: 30,
    fitnessGoal: 'WEIGHT_LOSS',
  });
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((food) => food.dietaryTags.includes('vegetarian')));
  assert.ok(suggestions.some((food) => food.name === 'Tofu'));
  const meals = buildMealSuggestions(seedFoods.map((food, index) => ({ ...food, id: `food-${index}` })), {
    dietaryPreference: 'VEGETARIAN',
    remainingCalories: 700,
    remainingProtein: 20,
    fitnessGoal: 'MAINTAIN_WEIGHT',
  });
  assert.ok(meals.length > 0);
  assert.ok(meals.every((meal) => meal.ingredients.every((item) => item.foodId)));
  assert.ok(meals.every((meal) => !meal.name.toLowerCase().includes('chicken')));
  assert.deepEqual(new Set(meals.map((meal) => meal.mealType)), new Set(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS']));
});

test('nutrition request validation rejects invalid food quantities and macro values', () => {
  assert.equal(foodEntrySchema.safeParse({ foodId: 'egg', quantity: 2, mealType: 'BREAKFAST' }).success, true);
  assert.equal(foodEntrySchema.safeParse({ foodId: 'egg', quantity: 0, mealType: 'BREAKFAST' }).success, false);
  assert.equal(foodEntrySchema.safeParse({ foodId: 'egg', quantity: 1, mealType: 'BRUNCH' }).success, false);
  assert.equal(foodEntryUpdateSchema.safeParse({}).success, false);
  assert.equal(nutritionTargetSchema.safeParse({ dailyCalories: 1100 }).success, false);
  assert.equal(customFoodSchema.safeParse({
    name: 'Homemade tofu bowl',
    category: 'Protein',
    servingUnit: 'bowl',
    servingSize: 200,
    calories: 220,
    proteinGrams: 18,
    carbohydratesGrams: 15,
    fatGrams: 8,
    dietaryTags: ['vegetarian'],
  }).success, true);
});
