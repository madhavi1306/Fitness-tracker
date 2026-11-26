import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStreaks,
  detectNewRecords,
  estimatedOneRepMax,
  filterWorkoutsByRange,
  getRangeStart,
  getMuscleGroupVolumes,
  getWeekdayVolumes,
  setVolume,
  summarizeWorkouts,
} from '../src/services/progress.service.js';
import { displayWeight, lbsToKg, kgToLbs } from '../../frontend/src/utils/units.js';

const workout = (date, exercises, durationSeconds = 1800) => ({
  id: date,
  startedAt: new Date(`${date}T12:00:00.000Z`),
  durationSeconds,
  exercises,
});
const exercise = (name, muscleGroup, sets) => ({ name, muscleGroup, sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, completed: true })) });

test('volume sums completed sets and ignores incomplete sets', () => {
  const session = workout('2026-11-23', [
    { ...exercise('Bench Press', 'Chest', [[60, 10], [65, 8]]), sets: [
      { weightKg: 60, reps: 10, completed: true },
      { weightKg: 65, reps: 8, completed: true },
      { weightKg: 100, reps: 10, completed: false },
    ] },
  ]);
  assert.equal(setVolume(60, 10), 600);
  assert.equal(summarizeWorkouts([session]).volumeKg, 1120);
  assert.equal(summarizeWorkouts([session]).sets, 2);
  assert.equal(summarizeWorkouts([session]).reps, 18);
});

test('Epley estimated one-rep max returns the expected value and rejects invalid sets', () => {
  assert.ok(Math.abs(estimatedOneRepMax(90, 3) - 99) < 0.000001);
  assert.equal(estimatedOneRepMax(0, 5), 0);
  assert.equal(estimatedOneRepMax(80, 0), 0);
});

test('new PR detection compares load, Epley estimate, reps at load, and exercise volume', () => {
  const firstSet = { weightKg: 85, reps: 5, completed: true };
  const records = detectNewRecords({
    set: firstSet,
    previousSets: [{ weightKg: 80, reps: 5 }],
    currentSets: [firstSet],
    previousExerciseVolumes: [400],
  });
  assert.deepEqual(records.map((record) => record.recordType).sort(), [
    'ESTIMATED_1RM',
    'EXERCISE_VOLUME',
    'MAX_REPS_AT_WEIGHT',
    'MAX_WEIGHT',
  ]);
  const noLoadPR = detectNewRecords({
    set: { weightKg: 85, reps: 3, completed: true },
    previousSets: [{ weightKg: 85, reps: 5 }],
    currentSets: [{ weightKg: 85, reps: 5, completed: true }, { weightKg: 85, reps: 3, completed: true }],
    previousExerciseVolumes: [400],
  });
  assert.deepEqual(noLoadPR.map((record) => record.recordType), ['EXERCISE_VOLUME']);
});

test('weekday and muscle split totals are calculated from completed set volume', () => {
  const workouts = [
    workout('2026-11-23', [exercise('Bench Press', 'Chest', [[50, 10]])]),
    workout('2026-11-24', [exercise('Squat', 'Legs', [[100, 5]])]),
  ];
  const weekdays = getWeekdayVolumes(workouts);
  assert.equal(weekdays.find((item) => item.day === 'Monday').volumeKg, 500);
  assert.equal(weekdays.find((item) => item.day === 'Tuesday').volumeKg, 500);
  const muscles = getMuscleGroupVolumes(workouts);
  assert.equal(muscles.find((item) => item.muscleGroup === 'Chest').volumeKg, 500);
  assert.equal(muscles.find((item) => item.muscleGroup === 'Legs').volumeKg, 500);
});

test('date filters select the expected completed workouts', () => {
  const workouts = [
    workout('2026-10-10', []),
    workout('2026-11-10', []),
    workout('2026-11-25', []),
  ];
  assert.equal(filterWorkoutsByRange(workouts, 'allTime').length, 3);
  assert.equal(filterWorkoutsByRange(workouts, 'last30Days', new Date('2026-11-25T12:00:00.000Z')).length, 2);
});

test('timezone-aware progress ranges begin at the user local Monday', () => {
  const now = new Date('2026-11-23T02:00:00.000Z');
  const start = getRangeStart('thisWeek', now, 480);
  assert.equal(start.toISOString(), '2026-11-16T08:00:00.000Z');
  const workouts = [
    { ...workout('2026-11-16', []), startedAt: new Date('2026-11-16T07:30:00.000Z') },
    { ...workout('2026-11-16', []), startedAt: new Date('2026-11-16T08:30:00.000Z') },
  ];
  assert.equal(filterWorkoutsByRange(workouts, 'thisWeek', now, 480).length, 1);
});

test('current and best workout streaks use distinct consecutive workout dates', () => {
  const workouts = [
    workout('2026-11-21', []),
    workout('2026-11-22', []),
    workout('2026-11-23', []),
    workout('2026-11-25', []),
  ];
  assert.deepEqual(calculateStreaks(workouts, new Date('2026-11-25T14:00:00.000Z')), {
    currentStreak: 1,
    bestStreak: 3,
  });

  test('kg and lb display conversion round-trips without changing stored kilograms', () => {
    assert.equal(kgToLbs(100), 220.462);
    assert.equal(lbsToKg(220.462), 100);
    assert.equal(displayWeight(100, 'lbs'), 220.462);
    assert.equal(displayWeight(100, 'kg'), 100);
  });
});
