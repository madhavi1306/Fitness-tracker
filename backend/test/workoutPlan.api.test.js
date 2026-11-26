import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MEMORY_MODE = 'true';
process.env.PGLITE_MODE = 'false';
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const { app } = await import('../src/app.js');

async function register(baseUrl, email, fullName) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName,
      email,
      password: 'secure-password-123',
      age: 30,
      heightCm: 175,
      currentWeightKg: 75,
      fitnessGoal: 'BUILD_STRENGTH',
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).token;
}

test('authenticated workout plans persist, edit one day, start sessions, and enforce ownership', async (context) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const ownerToken = await register(baseUrl, `planner-${Date.now()}@example.test`, 'Planner Owner');
  const otherToken = await register(baseUrl, `planner-other-${Date.now()}@example.test`, 'Other User');
  const headers = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
  const planConfig = {
    planType: 'WEEKLY',
    startDate: new Date().toISOString().slice(0, 10),
    availableDays: [1, 3, 5],
    equipment: ['Dumbbells', 'Bodyweight'],
    level: 'Beginner',
    availableMinutes: 45,
    splitPreference: 'FULL_BODY',
  };

  const unauthenticated = await fetch(`${baseUrl}/api/workout-plans/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(planConfig),
  });
  assert.equal(unauthenticated.status, 401);

  const generatedResponse = await fetch(`${baseUrl}/api/workout-plans/generate`, {
    method: 'POST',
    headers: headers(ownerToken),
    body: JSON.stringify(planConfig),
  });
  assert.equal(generatedResponse.status, 200);
  const generated = (await generatedResponse.json()).plan;
  assert.equal(generated.days.length, 7);
  assert.equal(generated.days.filter((day) => !day.isRestDay).length, 3);

  const savedResponse = await fetch(`${baseUrl}/api/workout-plans`, {
    method: 'POST',
    headers: headers(ownerToken),
    body: JSON.stringify(generated),
  });
  assert.equal(savedResponse.status, 201);
  const saved = (await savedResponse.json()).plan;
  assert.equal(saved.days.length, 7);

  const loadedResponse = await fetch(`${baseUrl}/api/workout-plans?date=${planConfig.startDate}`, {
    headers: headers(ownerToken),
  });
  assert.equal(loadedResponse.status, 200);
  const loaded = (await loadedResponse.json()).plan;
  assert.equal(loaded.id, saved.id);

  const editedDay = loaded.days.find((day) => !day.isRestDay);
  const editResponse = await fetch(`${baseUrl}/api/workout-plans/${saved.id}/days/${editedDay.id}`, {
    method: 'PATCH',
    headers: headers(ownerToken),
    body: JSON.stringify({
      title: 'Recovery Day',
      focus: 'Recovery',
      isRestDay: true,
      estimatedDurationMinutes: 0,
      warmup: '',
      cooldown: '',
      phase: 'Weekly plan',
      guidance: 'Take a rest day.',
      exercises: [],
    }),
  });
  assert.equal(editResponse.status, 200);
  assert.equal((await editResponse.json()).day.status, 'REST');

  const guidedDay = loaded.days.find((day) => day.id !== editedDay.id && !day.isRestDay);
  const startResponse = await fetch(`${baseUrl}/api/workouts/start`, {
    method: 'POST',
    headers: headers(ownerToken),
    body: JSON.stringify({ planDayId: guidedDay.id }),
  });
  assert.equal(startResponse.status, 201);
  const workout = (await startResponse.json()).workout;
  assert.ok(workout.exercises.length);
  const exercise = workout.exercises[0];
  const setResponse = await fetch(`${baseUrl}/api/workouts/${workout.id}/sets`, {
    method: 'POST',
    headers: headers(ownerToken),
    body: JSON.stringify({ exerciseId: exercise.id, setNumber: 1, reps: exercise.targetReps, weightKg: 0 }),
  });
  assert.equal(setResponse.status, 201);
  const finishResponse = await fetch(`${baseUrl}/api/workouts/${workout.id}/finish`, {
    method: 'POST',
    headers: headers(ownerToken),
    body: JSON.stringify({ durationSeconds: 0 }),
  });
  assert.equal(finishResponse.status, 200);

  const updatedPlanResponse = await fetch(`${baseUrl}/api/workout-plans/${saved.id}`, {
    headers: headers(ownerToken),
  });
  assert.equal(updatedPlanResponse.status, 200);
  const updatedPlan = (await updatedPlanResponse.json()).plan;
  assert.equal(updatedPlan.days.find((day) => day.id === guidedDay.id).status, 'COMPLETED');

  const progressResponse = await fetch(`${baseUrl}/api/progress/overall?range=thisWeek&timezoneOffsetMinutes=0`, {
    headers: headers(ownerToken),
  });
  assert.equal(progressResponse.status, 200);
  const weeklySummary = (await progressResponse.json()).weeklySummary;
  const today = new Date().toISOString().slice(0, 10);
  const mondayDate = new Date(`${today}T00:00:00.000Z`);
  mondayDate.setUTCDate(mondayDate.getUTCDate() - ((mondayDate.getUTCDay() + 6) % 7));
  const monday = mondayDate.toISOString().slice(0, 10);
  const sundayDate = new Date(mondayDate);
  sundayDate.setUTCDate(sundayDate.getUTCDate() + 6);
  const sunday = sundayDate.toISOString().slice(0, 10);
  const scheduledTrainingDays = updatedPlan.days.filter((day) => {
    const date = String(day.date).slice(0, 10);
    return date >= monday && date <= sunday && !day.isRestDay && (date <= today || day.status === 'COMPLETED');
  });
  const completedTrainingDays = scheduledTrainingDays.filter((day) => day.status === 'COMPLETED').length;
  assert.equal(weeklySummary.plannedWorkouts, scheduledTrainingDays.length);
  assert.equal(weeklySummary.completedPlannedWorkouts, completedTrainingDays);
  assert.equal(weeklySummary.adherencePercent, scheduledTrainingDays.length
    ? Math.round(completedTrainingDays / scheduledTrainingDays.length * 100)
    : 0);

  const forbiddenPlan = await fetch(`${baseUrl}/api/workout-plans/${saved.id}`, {
    headers: headers(otherToken),
  });
  assert.equal(forbiddenPlan.status, 404);
  const forbiddenWorkout = await fetch(`${baseUrl}/api/workouts/start`, {
    method: 'POST',
    headers: headers(otherToken),
    body: JSON.stringify({ planDayId: guidedDay.id }),
  });
  assert.equal(forbiddenWorkout.status, 404);
});

test('monthly plan generation returns every calendar date', async (context) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const token = await register(baseUrl, `planner-month-${Date.now()}@example.test`, 'Monthly Planner');
  const response = await fetch(`${baseUrl}/api/workout-plans/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      planType: 'MONTHLY',
      startDate: '2026-11-26',
      availableDays: [1, 3, 5],
      equipment: ['Dumbbells', 'Bodyweight'],
      level: 'Beginner',
      availableMinutes: 45,
      splitPreference: 'UPPER_LOWER',
    }),
  });
  assert.equal(response.status, 200);
  const plan = (await response.json()).plan;
  assert.equal(plan.days.length, 30);
  assert.equal(plan.startDate, '2026-11-01');
  assert.equal(plan.endDate, '2026-11-30');
});
