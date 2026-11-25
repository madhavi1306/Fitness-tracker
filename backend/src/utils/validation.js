import { z } from 'zod';

export const fitnessGoals = ['WEIGHT_GAIN', 'WEIGHT_LOSS', 'MAINTAIN_WEIGHT', 'BUILD_STRENGTH'];
export const activityLevels = ['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE', 'EXTRA_ACTIVE'];
export const dietaryPreferences = ['NONE', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'OTHER'];

const nameSchema = z.string().trim().min(2).max(80);
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long to process securely');
const ageSchema = z.coerce.number().int().min(13).max(100);
const heightSchema = z.coerce.number().min(100).max(250);
const weightSchema = z.coerce.number().min(25).max(400);

export const registerSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  age: ageSchema,
  heightCm: heightSchema,
  currentWeightKg: weightSchema,
  targetWeightKg: weightSchema.optional().nullable(),
  fitnessGoal: z.enum(fitnessGoals),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long to process securely'),
});

export const profileUpdateSchema = z.object({
  fullName: nameSchema.optional(),
  age: ageSchema.optional(),
  heightCm: heightSchema.optional(),
  currentWeightKg: weightSchema.optional(),
  targetWeightKg: weightSchema.optional().nullable(),
  fitnessGoal: z.enum(fitnessGoals).optional(),
  activityLevel: z.enum(activityLevels).optional(),
  dietaryPreference: z.enum(dietaryPreferences).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}
