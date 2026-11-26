import test from 'node:test';
import assert from 'node:assert/strict';
import { seedExercises } from '../src/data/exercises.js';
import {
  generateWorkoutSchedule,
  workoutScheduleConfigSchema,
} from '../src/services/workoutSchedule.service.js';

const exercises = seedExercises.map((exercise, index) => ({ id: `exercise-${index}`, ...exercise }));
const user = { fitnessGoal: 'WEIGHT_LOSS' };

test('weekly schedules use available days, equipment, level, and the exercise library', () => {
  const { data: config, success } = workoutScheduleConfigSchema.safeParse({
    planType: 'WEEKLY',
    startDate: '2026-11-26',
    availableDays: [1, 3, 5],
    equipment: ['Dumbbells', 'Bodyweight'],
    level: 'Beginner',
    availableMinutes: 45,
    splitPreference: 'FULL_BODY',
  });
  assert.equal(success, true);

  const plan = generateWorkoutSchedule({ config, user, exercises });
  assert.equal(plan.days.length, 7);
  assert.equal(plan.startDate, '2026-11-23');
  assert.equal(plan.endDate, '2026-11-29');
  assert.equal(plan.days.filter((day) => !day.isRestDay).length, 3);
  assert.ok(plan.days.filter((day) => !day.isRestDay).every((day) => (
    day.exercises.every((item) => {
      const exercise = exercises.find(({ id }) => id === item.exerciseId);
      return exercise.difficulty === 'Beginner'
        && ['Dumbbells', 'Bodyweight'].includes(exercise.equipment)
        && !Object.hasOwn(item, 'targetWeightKg');
    })
  )));
});

test('push-pull-legs plans suggest a different focus and exercises on each training day', () => {
  const plan = generateWorkoutSchedule({
    config: {
      planType: 'WEEKLY',
      startDate: '2026-11-26',
      availableDays: [1, 3, 5],
      equipment: ['Dumbbells', 'Bodyweight'],
      level: 'Beginner',
      availableMinutes: 45,
      splitPreference: 'PUSH_PULL_LEGS',
    },
    user,
    exercises,
  });
  const trainingDays = plan.days.filter((day) => !day.isRestDay);
  assert.deepEqual(trainingDays.map((day) => day.title), ['Push Day', 'Pull Day', 'Leg Day']);
  const scheduledExerciseIds = trainingDays.flatMap((day) => day.exercises.map((item) => item.exerciseId));
  assert.equal(new Set(scheduledExerciseIds).size, scheduledExerciseIds.length);
});

test('monthly schedules include every calendar date and a recovery week without weight increases', () => {
  const plan = generateWorkoutSchedule({
    config: {
      planType: 'MONTHLY',
      startDate: '2026-11-26',
      availableDays: [1, 3, 5],
      equipment: ['Dumbbells', 'Bodyweight'],
      level: 'Beginner',
      availableMinutes: 45,
      splitPreference: 'UPPER_LOWER',
    },
    user,
    exercises,
  });
  assert.equal(plan.startDate, '2026-11-01');
  assert.equal(plan.endDate, '2026-11-30');
  assert.equal(plan.days.length, 30);
  const recoveryWeek = plan.days.filter((day) => day.date >= '2026-11-22' && !day.isRestDay);
  assert.ok(recoveryWeek.length > 0);
  assert.ok(recoveryWeek.every((day) => day.phase === 'Recovery' && day.guidance.includes('Reduce each exercise')));
  assert.ok(recoveryWeek.every((day) => day.exercises.every((item) => item.sets === 1)));
});

test('schedule settings reject duplicate days and unsafe beginner frequency', () => {
  assert.equal(workoutScheduleConfigSchema.safeParse({
    planType: 'WEEKLY',
    availableDays: [1, 1],
  }).success, false);
  assert.equal(workoutScheduleConfigSchema.safeParse({
    planType: 'WEEKLY',
    availableDays: [0, 1, 2, 3, 4, 5],
    level: 'Beginner',
  }).success, false);
});
