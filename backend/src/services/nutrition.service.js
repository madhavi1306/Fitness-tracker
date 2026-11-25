const activityMultipliers = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  EXTRA_ACTIVE: 1.9,
};

const calorieAdjustments = {
  WEIGHT_GAIN: 200,
  WEIGHT_LOSS: -300,
  MAINTAIN_WEIGHT: 0,
  BUILD_STRENGTH: 100,
};

const proteinFactors = {
  WEIGHT_GAIN: 1.6,
  WEIGHT_LOSS: 1.8,
  MAINTAIN_WEIGHT: 1.4,
  BUILD_STRENGTH: 1.8,
};

const round1 = (value) => Math.round(value * 10) / 10;

export function estimateNutritionTargets(profile) {
  const bmr = Math.max(1200, Math.round(
    10 * profile.currentWeightKg
    + 6.25 * profile.heightCm
    - 5 * profile.age
    - 78,
  ));
  const maintenanceCalories = Math.round(bmr * (activityMultipliers[profile.activityLevel] || 1.55));
  const adjustment = profile.age < 18 ? 0 : calorieAdjustments[profile.fitnessGoal] || 0;
  const dailyCalories = adjustment < 0
    ? Math.max(bmr, maintenanceCalories + adjustment)
    : maintenanceCalories + adjustment;
  const proteinGrams = round1(Math.min(2.2, proteinFactors[profile.fitnessGoal] || 1.6) * profile.currentWeightKg);
  const fatGrams = round1(dailyCalories * 0.28 / 9);
  const carbohydratesGrams = round1(Math.max(0, (dailyCalories - proteinGrams * 4 - fatGrams * 9) / 4));

  return {
    maintenanceCalories,
    dailyCalories,
    proteinGrams,
    carbohydratesGrams,
    fatGrams,
    isCustom: false,
    estimateDisclaimer: 'Nutrition targets are rough estimates, not medical advice. Individual needs vary.',
    professionalGuidanceRecommended: profile.age < 18,
  };
}

export function createNutritionTarget(profile, overrides = {}) {
  const estimated = estimateNutritionTargets(profile);
  const dailyCalories = overrides.dailyCalories ?? estimated.dailyCalories;
  const proteinGrams = overrides.proteinGrams ?? estimated.proteinGrams;
  const fatGrams = overrides.fatGrams ?? round1(dailyCalories * 0.28 / 9);
  const carbohydratesGrams = overrides.carbohydratesGrams
    ?? round1(Math.max(0, (dailyCalories - proteinGrams * 4 - fatGrams * 9) / 4));
  const macroCalories = proteinGrams * 4 + carbohydratesGrams * 4 + fatGrams * 9;

  if (macroCalories > dailyCalories * 1.1) {
    return null;
  }

  return {
    maintenanceCalories: estimated.maintenanceCalories,
    dailyCalories,
    proteinGrams: round1(proteinGrams),
    carbohydratesGrams: round1(carbohydratesGrams),
    fatGrams: round1(fatGrams),
    isCustom: Object.keys(overrides).length > 0,
    estimateDisclaimer: estimated.estimateDisclaimer,
    professionalGuidanceRecommended: estimated.professionalGuidanceRecommended,
  };
}

export function calculateFoodNutrition(food, quantity) {
  return {
    calories: round1(food.calories * quantity),
    proteinGrams: round1(food.proteinGrams * quantity),
    carbohydratesGrams: round1(food.carbohydratesGrams * quantity),
    fatGrams: round1(food.fatGrams * quantity),
  };
}

export function summarizeFoodLogs(logs) {
  return logs.reduce((totals, entry) => ({
    calories: round1(totals.calories + entry.calories),
    proteinGrams: round1(totals.proteinGrams + entry.proteinGrams),
    carbohydratesGrams: round1(totals.carbohydratesGrams + entry.carbohydratesGrams),
    fatGrams: round1(totals.fatGrams + entry.fatGrams),
  }), { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });
}

function isAllowedForPreference(food, preference) {
  if (preference === 'VEGAN') return food.dietaryTags.includes('vegan');
  if (preference === 'VEGETARIAN') return food.dietaryTags.includes('vegetarian');
  if (preference === 'PESCATARIAN') {
    return food.dietaryTags.includes('vegetarian') || food.dietaryTags.includes('pescatarian');
  }
  return true;
}

export function suggestFoods(foods, { dietaryPreference, remainingCalories, remainingProtein, fitnessGoal }) {
  const calorieRoom = Math.max(150, remainingCalories);
  return foods
    .filter((food) => isAllowedForPreference(food, dietaryPreference))
    .filter((food) => food.calories <= calorieRoom * 1.25)
    .map((food) => {
      const proteinDensity = food.proteinGrams / Math.max(food.calories, 1);
      const calorieDensity = food.calories / Math.max(food.proteinGrams, 1);
      const score = remainingProtein > 5
        ? proteinDensity * 100 - Math.max(0, food.calories - calorieRoom) / 10
        : fitnessGoal === 'WEIGHT_GAIN'
          ? calorieDensity + food.proteinGrams / 10
          : proteinDensity * 100;
      return { food, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ food }) => food);
}

const mealTemplates = [
  { mealType: 'BREAKFAST', name: 'Oats, milk & banana', ingredients: [['Oats', 1], ['Milk', 1], ['Banana', 1]] },
  { mealType: 'BREAKFAST', name: 'Idli with sambar', ingredients: [['Idli', 1], ['Sambar', 1]] },
  { mealType: 'BREAKFAST', name: 'Eggs and chapati', ingredients: [['Egg', 2], ['Chapati', 1]] },
  { mealType: 'LUNCH', name: 'Dal, rice & vegetables', ingredients: [['Dal', 1], ['Cooked Rice', 1], ['Mixed Vegetables', 1]] },
  { mealType: 'LUNCH', name: 'Chickpea chapati plate', ingredients: [['Chickpeas', 1], ['Chapati', 1], ['Curd', 1]] },
  { mealType: 'LUNCH', name: 'Chicken, rice & vegetables', ingredients: [['Cooked Chicken Breast', 1], ['Cooked Rice', 1], ['Mixed Vegetables', 1]] },
  { mealType: 'DINNER', name: 'Paneer, chapati & vegetables', ingredients: [['Paneer', 1], ['Chapati', 1], ['Mixed Vegetables', 1]] },
  { mealType: 'DINNER', name: 'Tofu, rice & vegetables', ingredients: [['Tofu', 1], ['Cooked Rice', 1], ['Mixed Vegetables', 1]] },
  { mealType: 'DINNER', name: 'Chicken, chapati & vegetables', ingredients: [['Cooked Chicken Breast', 1], ['Chapati', 1], ['Mixed Vegetables', 1]] },
  { mealType: 'SNACKS', name: 'Curd and fruit', ingredients: [['Curd', 1], ['Mixed Fruit', 1]] },
  { mealType: 'SNACKS', name: 'Milk and banana', ingredients: [['Milk', 1], ['Banana', 1]] },
  { mealType: 'SNACKS', name: 'Tofu snack bowl', ingredients: [['Tofu', 1], ['Mixed Vegetables', 1]] },
];

export function buildMealSuggestions(foods, options) {
  const byName = new Map(foods.map((food) => [food.name.toLowerCase(), food]));
  const maxCalories = Math.max(300, options.remainingCalories * 1.25);
  return mealTemplates.flatMap((template) => {
    const ingredients = template.ingredients.map(([name, quantity]) => ({
      food: byName.get(name.toLowerCase()),
      quantity,
    }));
    if (ingredients.some(({ food }) => !food || !isAllowedForPreference(food, options.dietaryPreference))) return [];
    const nutrition = ingredients.reduce((total, { food, quantity }) => {
      const scaled = calculateFoodNutrition(food, quantity);
      return {
        calories: round1(total.calories + scaled.calories),
        proteinGrams: round1(total.proteinGrams + scaled.proteinGrams),
        carbohydratesGrams: round1(total.carbohydratesGrams + scaled.carbohydratesGrams),
        fatGrams: round1(total.fatGrams + scaled.fatGrams),
      };
    }, { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });
    const caloriesFit = nutrition.calories <= maxCalories;
    return [{
      ...template,
      ingredients: ingredients.map(({ food, quantity }) => ({ foodId: food.id, foodName: food.name, quantity })),
      nutrition,
      caloriesFit,
      score: options.remainingProtein > 5
        ? nutrition.proteinGrams / Math.max(nutrition.calories, 1) - (caloriesFit ? 0 : 1)
        : options.fitnessGoal === 'WEIGHT_GAIN'
          ? (caloriesFit ? 1 : 0) + nutrition.calories / 1000 + nutrition.proteinGrams / 100
          : options.fitnessGoal === 'WEIGHT_LOSS'
            ? nutrition.proteinGrams / Math.max(nutrition.calories, 1) * 100
            : (caloriesFit ? 1 : 0) + nutrition.proteinGrams / 100,
    }];
  }).sort((a, b) => b.score - a.score);
}
