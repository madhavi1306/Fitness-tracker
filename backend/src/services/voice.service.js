import { calculateFoodNutrition, suggestFoods } from './nutrition.service.js';
import { setVolume, summarizeWorkouts } from './progress.service.js';

const quantityWords = new Map([
  ['a', 1], ['an', 1], ['one', 1], ['two', 2], ['three', 3], ['four', 4],
  ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
]);

const aliases = {
  Egg: ['eggs'],
  Chapati: ['chapatis', 'roti', 'rotis'],
  'Cooked Rice': ['rice'],
  Dal: ['lentils'],
  Milk: ['glass of milk'],
  Banana: ['bananas'],
  'Cooked Chicken Breast': ['chicken'],
  Chickpeas: ['chickpea', 'chickpeas', 'chana'],
  Idli: ['idlis'],
  Dosa: ['dosas'],
  Oats: ['oatmeal'],
  'Mixed Vegetables': ['vegetables', 'veggies'],
  'Mixed Fruit': ['fruits', 'fruit'],
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function foodTerms(food) {
  const terms = [food.name.toLowerCase(), ...(aliases[food.name] || [])];
  if (food.name === 'Egg') terms.push('egg');
  if (food.name === 'Chapati') terms.push('chapati');
  return [...new Set(terms)].sort((left, right) => right.length - left.length);
}

export function parseFoodMentions(message, foods) {
  const candidates = foods.flatMap((food) => foodTerms(food).map((term) => ({ food, term })))
    .sort((left, right) => right.term.length - left.term.length);
  if (!candidates.length) return [];

  const terms = candidates.map(({ term }) => escapeRegex(term)).join('|');
  const matcher = new RegExp(
    `\\b(?:(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\\s*(g|grams?|kg|kilograms?)?\\s*(?:(?:large|small|medium)\\s*)?(?:(?:bowls?|pieces?|glasses?|cups?|servings?)\\s*)?(?:of\\s*)?)?(${terms})\\b`,
    'gi',
  );
  const mentions = [];
  for (const match of message.matchAll(matcher)) {
    const term = match[3].toLowerCase();
    const candidate = candidates.find(({ term: candidateTerm }) => candidateTerm === term);
    if (!candidate) continue;
    const rawQuantity = match[1]?.trim().toLowerCase();
    let quantity = rawQuantity ? Number(rawQuantity) || quantityWords.get(rawQuantity) : 1;
    const unit = match[2]?.toLowerCase();
    if (unit && quantity) {
      const grams = unit === 'kg' || unit.startsWith('kilo') ? quantity * 1000 : quantity;
      quantity = grams / candidate.food.servingSize;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) continue;
    const existing = mentions.find((entry) => entry.food.id === candidate.food.id);
    if (existing) existing.quantity += quantity;
    else mentions.push({ food: candidate.food, quantity });
  }
  return mentions.map(({ food, quantity }) => ({
    foodId: food.id,
    foodName: food.name,
    servingUnit: food.servingUnit,
    quantity,
    nutrition: calculateFoodNutrition(food, quantity),
  }));
}

export function workoutVolume(workout) {
  return (workout.exercises || []).reduce((total, exercise) => total + (exercise.sets || [])
    .filter((set) => set.completed)
    .reduce((exerciseTotal, set) => exerciseTotal + setVolume(set.weightKg, set.reps), 0), 0);
}

export function summarizeFoodMentions(mentions) {
  return mentions.reduce((total, item) => ({
    calories: total.calories + item.nutrition.calories,
    proteinGrams: total.proteinGrams + item.nutrition.proteinGrams,
    carbohydratesGrams: total.carbohydratesGrams + item.nutrition.carbohydratesGrams,
    fatGrams: total.fatGrams + item.nutrition.fatGrams,
  }), { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 });
}

export function voiceFoodSuggestions(foods, options) {
  return suggestFoods(foods, options).slice(0, 3).map((food) => food.name);
}
