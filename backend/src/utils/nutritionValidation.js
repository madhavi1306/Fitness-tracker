import { z } from 'zod';

export const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'];
export const dietaryTags = ['vegetarian', 'vegan', 'pescatarian'];

const foodId = z.string().trim().min(1).max(100);
const quantity = z.coerce.number().finite().min(0.1).max(50);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a real calendar date');

export const foodEntrySchema = z.object({
  foodId,
  quantity,
  mealType: z.enum(mealTypes),
  date: date.optional(),
}).strict();

export const foodEntryUpdateSchema = z.object({
  foodId: foodId.optional(),
  quantity: quantity.optional(),
  mealType: z.enum(mealTypes).optional(),
  date: date.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const customFoodSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(40),
  servingUnit: z.string().trim().min(1).max(30),
  servingSize: z.coerce.number().finite().min(0.1).max(10000),
  calories: z.coerce.number().finite().min(0).max(2000),
  proteinGrams: z.coerce.number().finite().min(0).max(300),
  carbohydratesGrams: z.coerce.number().finite().min(0).max(500),
  fatGrams: z.coerce.number().finite().min(0).max(300),
  dietaryTags: z.array(z.enum(dietaryTags)).max(dietaryTags.length).default([]),
}).strict().refine(
  (food) => food.proteinGrams * 4 + food.carbohydratesGrams * 4 + food.fatGrams * 9 <= food.calories * 1.25 + 10,
  { message: 'Macros do not match the listed calories', path: ['calories'] },
);

export const nutritionTargetSchema = z.object({
  dailyCalories: z.coerce.number().int().min(1200).max(6000).optional(),
  proteinGrams: z.coerce.number().finite().min(20).max(300).optional(),
  carbohydratesGrams: z.coerce.number().finite().min(0).max(1000).optional(),
  fatGrams: z.coerce.number().finite().min(0).max(400).optional(),
}).strict();

export function isRealNutritionDate(value) {
  const parsed = date.safeParse(value);
  return parsed.success;
}
