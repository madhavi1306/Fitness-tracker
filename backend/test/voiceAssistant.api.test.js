import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MEMORY_MODE = 'true';
process.env.PGLITE_MODE = 'false';
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const { app } = await import('../src/app.js');

test('voice gym commands navigate to schedules and control an authenticated workout', async (context) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Voice Gym Test',
      email: 'voice-gym-test@example.com',
      password: 'secure-password-123',
      age: 30,
      heightCm: 170,
      currentWeightKg: 70,
      fitnessGoal: 'MAINTAIN_WEIGHT',
    }),
  });
  assert.equal(registration.status, 201);
  const { token } = await registration.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  async function chat(message, body = {}) {
    return fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, ...body }),
    });
  }

  const todaySchedule = await chat("Open today's workout", { date: '2026-04-15' });
  assert.deepEqual(await todaySchedule.json(), {
    response: 'Opening today’s workout schedule.',
    action: { type: 'NAVIGATE', path: '/app/planner?date=2026-04-15&view=TODAY' },
  });

  const monthlySchedule = await chat('Open monthly timetable', { date: '2026-04-15' });
  assert.deepEqual(await monthlySchedule.json(), {
    response: 'Opening your monthly workout calendar.',
    action: { type: 'NAVIGATE', path: '/app/planner?date=2026-04-01&view=MONTHLY' },
  });

  const exerciseResponse = await fetch(`${baseUrl}/api/exercises`, { headers });
  const { exercises } = await exerciseResponse.json();
  const legExercise = exercises.find((exercise) => exercise.muscleGroup === 'Legs');
  assert.ok(legExercise, 'a seeded leg exercise is available');

  const templateResponse = await fetch(`${baseUrl}/api/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Leg Day',
      exercises: [{ exerciseId: legExercise.id, sets: 2, targetReps: 10, targetWeightKg: 0, restSeconds: 60 }],
    }),
  });
  const { template } = await templateResponse.json();
  assert.equal(templateResponse.status, 201);

  const openLeg = await chat('Open leg workout');
  const openLegResult = await openLeg.json();
  assert.equal(openLegResult.action.type, 'NAVIGATE');
  assert.equal(openLegResult.action.path, `/app/workouts?template=${template.id}`);

  const startLeg = await chat('Start a leg workout');
  const startLegResult = await startLeg.json();
  assert.equal(startLegResult.action.type, 'CHOOSE_WORKOUT');
  assert.deepEqual(startLegResult.action.templates.map(({ id }) => id), [template.id]);

  const startResponse = await fetch(`${baseUrl}/api/workouts/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ templateId: template.id }),
  });
  const { workout } = await startResponse.json();
  assert.equal(startResponse.status, 201);

  const resumeWorkout = await chat('Start my workout');
  const resumeResult = await resumeWorkout.json();
  assert.equal(resumeResult.action.path, `/app/workouts/live/${workout.id}`);

  const voiceSet = await chat('I completed 8 reps', {
    activeExerciseId: workout.exercises[0].id,
  });
  const voiceSetResult = await voiceSet.json();
  assert.equal(voiceSetResult.action.type, 'LOG_SET');
  assert.equal(voiceSetResult.action.workoutId, workout.id);

  const updateWeight = await chat('Set weight to 15 pounds', {
    activeExerciseId: workout.exercises[0].id,
  });
  const weightResult = await updateWeight.json();
  assert.equal(weightResult.action.command, 'SET_WEIGHT');
  assert.equal(weightResult.action.workoutId, workout.id);
  assert.equal(weightResult.action.weightKg, 6.8);
  assert.equal(weightResult.action.exerciseId, workout.exercises[0].id);

  const restTimer = await chat('Start rest timer for 90 seconds');
  assert.equal((await restTimer.json()).action.restSeconds, 90);

  const previousExercise = await chat('Previous exercise');
  const previousResult = await previousExercise.json();
  assert.equal(previousResult.action.command, 'PREVIOUS_EXERCISE');
  assert.equal(previousResult.action.workoutId, workout.id);

  const finishWorkout = await chat('Finish my workout');
  const finishResult = await finishWorkout.json();
  assert.equal(finishResult.action.type, 'CONFIRM_FINISH');
  assert.equal(finishResult.action.workoutId, workout.id);

  const explainExercise = await chat('Explain current exercise', {
    activeWorkoutId: workout.id,
    activeExerciseId: workout.exercises[0].id,
    activeExerciseName: legExercise.name,
  });
  const explanation = await explainExercise.json();
  assert.equal(explanation.data.exercise.id, legExercise.id);
  assert.ok(explanation.data.exercise.instructions.length > 0);
});
