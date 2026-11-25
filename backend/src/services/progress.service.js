export const progressRanges = ['thisWeek', 'thisMonth', 'last30Days', 'allTime'];
export const muscleGroupNames = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

export function estimatedOneRepMax(weightKg, reps) {
  if (!Number.isFinite(weightKg) || !Number.isInteger(reps) || weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

export function setVolume(weightKg, reps) {
  return Math.max(0, Number(weightKg) || 0) * Math.max(0, Number(reps) || 0);
}

export function detectNewRecords({ set, previousSets, currentSets, previousExerciseVolumes }) {
  const maximum = (values) => values.length ? Math.max(...values) : null;
  const sameLoadSets = previousSets.filter((item) => Number(item.weightKg).toFixed(2) === Number(set.weightKg).toFixed(2));
  const candidates = [
    ...(set.weightKg > 0 ? [
      {
        recordType: 'MAX_WEIGHT',
        value: set.weightKg,
        weightKg: set.weightKg,
        reps: set.reps,
        previousValue: maximum(previousSets.map((item) => item.weightKg).filter((value) => value > 0)),
      },
      {
        recordType: 'ESTIMATED_1RM',
        value: estimatedOneRepMax(set.weightKg, set.reps),
        weightKg: set.weightKg,
        reps: set.reps,
        previousValue: maximum(previousSets.map((item) => estimatedOneRepMax(item.weightKg, item.reps)).filter((value) => value > 0)),
      },
    ] : []),
    {
      recordType: 'MAX_REPS_AT_WEIGHT',
      value: set.reps,
      weightKg: set.weightKg,
      reps: set.reps,
      previousValue: maximum(sameLoadSets.map((item) => item.reps)),
    },
    {
      recordType: 'EXERCISE_VOLUME',
      value: currentSets.filter((item) => item.completed).reduce((sum, item) => sum + setVolume(item.weightKg, item.reps), 0),
      weightKg: null,
      reps: null,
      previousValue: maximum(previousExerciseVolumes) || null,
    },
  ];
  return candidates.filter((candidate) => candidate.value > (candidate.previousValue ?? 0));
}

export function getRangeStart(range, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'thisWeek') {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    return start;
  }
  if (range === 'thisMonth') {
    start.setDate(1);
    return start;
  }
  if (range === 'last30Days') {
    start.setDate(start.getDate() - 29);
    return start;
  }
  return null;
}

export function filterWorkoutsByRange(workouts, range, now = new Date()) {
  const rangeStart = getRangeStart(range, now);
  if (!rangeStart) return workouts;
  return workouts.filter((workout) => new Date(workout.startedAt) >= rangeStart);
}

export function summarizeWorkouts(workouts) {
  return workouts.reduce((summary, workout) => {
    summary.workouts += 1;
    summary.durationSeconds += workout.durationSeconds || 0;
    for (const exercise of workout.exercises || []) {
      for (const set of exercise.sets || []) {
        if (!set.completed) continue;
        summary.sets += 1;
        summary.reps += set.reps;
        summary.volumeKg += setVolume(set.weightKg, set.reps);
      }
    }
    return summary;
  }, { workouts: 0, volumeKg: 0, sets: 0, reps: 0, durationSeconds: 0 });
}

export function calculateStreaks(workouts, now = new Date()) {
  const days = [...new Set(workouts.map((workout) => {
    const date = new Date(workout.startedAt);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  }))].sort((a, b) => a - b);
  if (!days.length) return { currentStreak: 0, bestStreak: 0 };

  const dayMs = 86400000;
  let bestStreak = 1;
  let streak = 1;
  for (let index = 1; index < days.length; index += 1) {
    streak = days[index] - days[index - 1] === dayMs ? streak + 1 : 1;
    bestStreak = Math.max(bestStreak, streak);
  }

  const todayDate = new Date(now);
  const today = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  const lastDay = days[days.length - 1];
  if (today - lastDay > dayMs) return { currentStreak: 0, bestStreak };
  let currentStreak = 1;
  for (let index = days.length - 1; index > 0 && days[index] - days[index - 1] === dayMs; index -= 1) {
    currentStreak += 1;
  }
  return { currentStreak, bestStreak };
}

export function getWeekdayVolumes(workouts) {
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const totals = weekdays.map((day) => ({ day, volumeKg: 0, workouts: 0 }));
  for (const workout of workouts) {
    const weekday = (new Date(workout.startedAt).getDay() + 6) % 7;
    totals[weekday].workouts += 1;
    for (const exercise of workout.exercises || []) {
      for (const set of exercise.sets || []) {
        if (set.completed) totals[weekday].volumeKg += setVolume(set.weightKg, set.reps);
      }
    }
  }
  return totals;
}

export function getExerciseRecords(workouts, exerciseName) {
  const records = [];
  for (const workout of workouts) {
    for (const exercise of workout.exercises || []) {
      if (exerciseName && exercise.name !== exerciseName) continue;
      const sets = (exercise.sets || []).filter((set) => set.completed);
      if (!sets.length) continue;
      records.push({
        workoutId: workout.id,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscleGroup,
        date: workout.finishedAt || workout.startedAt,
        volumeKg: sets.reduce((sum, set) => sum + setVolume(set.weightKg, set.reps), 0),
        estimatedOneRepMaxKg: Math.max(...sets.map((set) => estimatedOneRepMax(set.weightKg, set.reps))),
        sets,
      });
    }
  }
  return records;
}

export function getMuscleGroupVolumes(workouts) {
  const volumes = Object.fromEntries(muscleGroupNames.map((name) => [name, 0]));
  for (const workout of workouts) {
    for (const exercise of workout.exercises || []) {
      if (!(exercise.muscleGroup in volumes)) continue;
      for (const set of exercise.sets || []) {
        if (set.completed) volumes[exercise.muscleGroup] += setVolume(set.weightKg, set.reps);
      }
    }
  }
  return muscleGroupNames.map((muscleGroup) => ({ muscleGroup, volumeKg: volumes[muscleGroup] }));
}
