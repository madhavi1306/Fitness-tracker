import { z } from 'zod';

export const muscleGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
export const equipmentTypes = ['Barbell', 'Dumbbells', 'Machine', 'Cable', 'Bodyweight', 'Resistance Bands'];
export const difficultyLevels = ['Beginner', 'Intermediate', 'Advanced'];

const text = (max = 500) => z.string().trim().min(1).max(max);
const optionalNotes = z.string().trim().max(1000).optional().nullable();
const imageUrl = z.string().url().max(1000).optional().nullable();

export const exerciseSchema = z.object({
  name: text(100),
  muscleGroup: z.enum(muscleGroups),
  equipment: z.enum(equipmentTypes),
  description: text(1000),
  difficulty: z.enum(difficultyLevels),
  instructions: z.array(text(300)).min(1).max(12),
  imageUrl,
}).strict();

export const exerciseUpdateSchema = exerciseSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const templateExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  sets: z.coerce.number().int().min(1).max(20),
  targetReps: z.coerce.number().int().min(1).max(100),
  targetWeightKg: z.coerce.number().finite().min(0).max(1000).optional().nullable(),
  restSeconds: z.coerce.number().int().min(0).max(3600).default(60),
  notes: optionalNotes,
}).strict();

const templateFields = {
  name: text(100),
  notes: optionalNotes,
  exercises: z.array(templateExerciseSchema).min(1).max(40)
    .refine((items) => new Set(items.map((item) => item.exerciseId)).size === items.length, 'An exercise can only appear once per template'),
};

export const templateSchema = z.object(templateFields).strict();
export const templateUpdateSchema = z.object(templateFields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const startWorkoutSchema = z.object({
  templateId: z.string().min(1).max(100),
}).strict();

export const workoutSetSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  setNumber: z.coerce.number().int().min(1).max(20),
  reps: z.coerce.number().int().min(1).max(1000),
  weightKg: z.coerce.number().finite().min(0).max(10000),
}).strict();

export const finishWorkoutSchema = z.object({
  durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
}).strict();
