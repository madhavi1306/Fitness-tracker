import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

process.env.MEMORY_MODE = 'true';
process.env.PGLITE_MODE = 'false';
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const { app } = await import('../src/app.js');
const { editWorkoutPlan } = await import('../src/services/workoutPlan.service.js');

test('authenticated voice API handles safe navigation and prepares food without saving it', async (context) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Voice Test',
      email: 'voice-test@example.com',
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

  const unauthenticated = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'open dashboard' }),
  });
  assert.equal(unauthenticated.status, 401);

  const navigation = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Please open dashboard' }),
  });
  assert.deepEqual(await navigation.json(), {
    response: 'Opening your dashboard.',
    action: { type: 'NAVIGATE', path: '/app' },
  });

  const greeting = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Hello.' }),
  });
  assert.equal((await greeting.json()).response, 'Hi! What can I help you with today?');

  const historyNavigation = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Open my workout history' }),
  });
  assert.deepEqual(await historyNavigation.json(), {
    response: 'Opening your workout history.',
    action: { type: 'NAVIGATE', path: '/app/workouts/history' },
  });

  const calorieQuestion = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'How many calories are in two eggs?' }),
  });
  assert.match((await calorieQuestion.json()).response, /2 eggs contain about 144 calories/i);

  const mealSuggestion = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'I want to gain weight. Suggest a high protein vegetarian meal.',
      date: '2026-05-04',
    }),
  });
  const mealResult = await mealSuggestion.json();
  assert.equal(mealSuggestion.status, 200);
  assert.match(mealResult.response, /For your weight gain goal, try/);
  assert.equal(mealResult.action.type, 'SHOW_MEAL_SUGGESTION');
  assert.ok(mealResult.action.items.length);
  assert.equal(mealResult.action.date, '2026-05-04');
  assert.equal(mealResult.action.items.some((item) => /chicken/i.test(item.foodName)), false);

  const contextualMeal = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'What should I eat?',
      context: { topic: 'NUTRITION', goal: 'WEIGHT_GAIN' },
    }),
  });
  assert.match((await contextualMeal.json()).response, /For your weight gain goal, try/);

  const proteinTarget = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'How much protein should I eat?' }),
  });
  assert.match((await proteinTarget.json()).response, /daily protein target is about .* based on your saved profile/i);

  const tomorrowSuggestion = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'What about tomorrow?',
      context: { topic: 'NUTRITION', goal: 'WEIGHT_GAIN' },
    }),
  });
  assert.match((await tomorrowSuggestion.json()).response, /For tomorrow, try/);

  const foodRecognition = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'I ate two eggs and two chapatis and dal', date: '2026-05-04' }),
  });
  const prepared = await foodRecognition.json();
  assert.equal(foodRecognition.status, 200);
  assert.equal(prepared.action.type, 'CONFIRM_FOOD');
  assert.deepEqual(prepared.action.items.map(({ foodName, quantity }) => [foodName, quantity]), [
    ['Egg', 2],
    ['Chapati', 2],
    ['Dal', 1],
  ]);
  assert.equal(prepared.data.calories, 564);

  const breakfastIntent = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Log two eggs for breakfast', date: '2026-05-04' }),
  });
  assert.equal((await breakfastIntent.json()).action.mealType, 'BREAKFAST');

  const today = await fetch(`${baseUrl}/api/nutrition/today?date=2026-05-04`, { headers });
  assert.deepEqual((await today.json()).logs, [], 'recognized food stays pending until the user confirms');

  for (const item of prepared.action.items) {
    const savedFood = await fetch(`${baseUrl}/api/nutrition/food`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        foodId: item.foodId,
        quantity: item.quantity,
        mealType: 'LUNCH',
        date: '2026-05-04',
      }),
    });
    assert.equal(savedFood.status, 201);
  }
  const loggedToday = await fetch(`${baseUrl}/api/nutrition/today?date=2026-05-04`, { headers });
  assert.equal((await loggedToday.json()).totals.calories, 564);
  const mealHistory = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'What did I eat today?', date: '2026-05-04' }),
  });
  assert.match((await mealHistory.json()).response, /Today's meals:.*Egg/i);
  const proteinRemaining = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'How much protein remaining', date: '2026-05-04' }),
  });
  assert.match((await proteinRemaining.json()).response, /protein remaining/);

  const invalidDate = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'open dashboard', date: '2026-02-31' }),
  });
  assert.equal(invalidDate.status, 400);

  const exercisesResponse = await fetch(`${baseUrl}/api/exercises`, { headers });
  const { exercises } = await exercisesResponse.json();
  const legIntent = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'I want to do some leg exercises' }),
  });
  const legResult = await legIntent.json();
  assert.equal(legResult.action.type, 'CONFIRM_NAVIGATION');
  assert.match(legResult.action.path, /muscleGroup=Legs/);

  const tomorrowWorkout = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'What about tomorrow?', context: { topic: 'EXERCISE' } }),
  });
  assert.match((await tomorrowWorkout.json()).response, /different muscle group|recovery day/i);

  const selectedExercise = exercises.find(({ ownerId }) => ownerId === null) || exercises[0];
  const exerciseLookup = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: `Open ${selectedExercise.name}` }),
  });
  const exerciseResult = await exerciseLookup.json();
  assert.equal(exerciseResult.action.type, 'NAVIGATE');
  assert.equal(exerciseResult.action.exerciseId, selectedExercise.id);
  assert.match(exerciseResult.action.path, /exercise=/);

  const repFollowUp = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'How many reps should I do?',
      activeExerciseId: selectedExercise.id,
    }),
  });
  assert.match((await repFollowUp.json()).response, new RegExp(selectedExercise.name));

  const templateResponse = await fetch(`${baseUrl}/api/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Voice Test Workout',
      exercises: [{ exerciseId: exercises[0].id, sets: 1, targetReps: 8, targetWeightKg: 20, restSeconds: 30 }],
    }),
  });
  const { template } = await templateResponse.json();
  assert.equal(templateResponse.status, 201);

  const workoutRecommendation = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'What workout should I do today?' }),
  });
  const workoutRecommendationResult = await workoutRecommendation.json();
  assert.equal(workoutRecommendationResult.action.type, 'SHOW_WORKOUT_PLAN');
  assert.ok(workoutRecommendationResult.data.plan.exercises.length);

  const startCommand = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Please start a workout' }),
  });
  const startResult = await startCommand.json();
  assert.equal(startResult.action.type, 'CHOOSE_WORKOUT');
  assert.deepEqual(startResult.action.templates.map(({ id }) => id), [template.id]);

  const started = await fetch(`${baseUrl}/api/workouts/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ templateId: template.id }),
  });
  const { workout } = await started.json();
  assert.equal(started.status, 201);

  const pauseCommand = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Pause my timer', activeWorkoutId: workout.id }),
  });
  assert.equal((await pauseCommand.json()).action.command, 'PAUSE_TIMER');

  const finishCommand = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Finish my workout', activeWorkoutId: workout.id }),
  });
  const finishResult = await finishCommand.json();
  assert.equal(finishResult.action.type, 'CONFIRM_FINISH');
  assert.equal(finishResult.action.workoutId, workout.id);

  const voiceSetIntent = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'I completed 8 reps at 20 kg',
      activeWorkoutId: workout.id,
      activeExerciseId: workout.exercises[0].id,
    }),
  });
  const voiceSetAction = await voiceSetIntent.json();
  assert.equal(voiceSetAction.action.type, 'LOG_SET');
  assert.equal(voiceSetAction.action.setNumber, 1);
  assert.equal(voiceSetAction.action.weightKg, 20);
  const savedSet = await fetch(`${baseUrl}/api/workouts/${workout.id}/sets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      exerciseId: voiceSetAction.action.exerciseId,
      setNumber: voiceSetAction.action.setNumber,
      reps: voiceSetAction.action.reps,
      weightKg: voiceSetAction.action.weightKg,
    }),
  });
  assert.equal(savedSet.status, 201);
  const finishedWorkout = await fetch(`${baseUrl}/api/workouts/${workout.id}/finish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ durationSeconds: 0 }),
  });
  assert.equal(finishedWorkout.status, 200);
  const historyQuery = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'How many workouts have I completed?' }),
  });
  assert.match((await historyQuery.json()).response, /completed 1 workouts/);

  const generatedPlanResponse = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Create a beginner 20 minute full body workout with no equipment',
      date: '2026-05-04',
    }),
  });
  const generatedResult = await generatedPlanResponse.json();
  assert.equal(generatedPlanResponse.status, 200);
  assert.equal(generatedResult.action.type, 'SHOW_WORKOUT_PLAN');
  assert.equal(generatedResult.data.plan.level, 'Beginner');
  assert.equal(generatedResult.data.plan.date, '2026-05-04');
  assert.ok(generatedResult.data.plan.exercises.length > 1);
  assert.ok(generatedResult.data.plan.exercises.every((exercise) => exercise.equipment === 'Bodyweight'));
  assert.match(generatedResult.data.plan.recoveryNote, /Legs/);

  const easierEdit = editWorkoutPlan({
    currentPlan: generatedResult.data.plan,
    instruction: 'Make it easier',
    exercises,
  });
  assert.equal(easierEdit.error, undefined);
  const easierPlan = easierEdit.plan;
  assert.ok(easierPlan.exercises.every((exercise) => exercise.sets <= 2 && exercise.reps <= 10));

  const additionalExercise = exercises.find((exercise) => !easierPlan.exercises.some((item) => item.exerciseId === exercise.id));
  const addedExercise = editWorkoutPlan({
    currentPlan: easierPlan,
    instruction: `Add ${additionalExercise.name} to my workout`,
    exercises,
  });
  assert.equal(addedExercise.error, undefined);
  assert.ok(addedExercise.plan.exercises.some((exercise) => exercise.exerciseId === additionalExercise.id));

  const replacement = editWorkoutPlan({
    currentPlan: easierPlan,
    instruction: 'Replace incline push-up with dumbbell chest press',
    exercises,
  });
  assert.equal(replacement.error, undefined);
  assert.match(replacement.plan.exercises[0].name, /dumbbell chest press/i);

  const removal = editWorkoutPlan({
    currentPlan: replacement.plan,
    instruction: 'Remove bird dog',
    exercises,
  });
  assert.equal(removal.error, undefined);
  const editedPlan = removal.plan;
  assert.equal(editedPlan.exercises.some((exercise) => /bird dog/i.test(exercise.name)), false);
  assert.ok(editedPlan.estimatedMinutes > 0);

  const savedGeneratedTemplate = await fetch(`${baseUrl}/api/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: editedPlan.title,
      notes: `${editedPlan.goal} · ${editedPlan.date}`,
      exercises: editedPlan.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        sets: exercise.sets,
        targetReps: exercise.reps,
        targetWeightKg: null,
        restSeconds: exercise.restSeconds,
        notes: exercise.instructions.join(' '),
      })),
    }),
  });
  const { template: generatedTemplate } = await savedGeneratedTemplate.json();
  assert.equal(savedGeneratedTemplate.status, 201);

  const startedGeneratedWorkout = await fetch(`${baseUrl}/api/workouts/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ templateId: generatedTemplate.id }),
  });
  const { workout: generatedWorkout } = await startedGeneratedWorkout.json();
  assert.equal(startedGeneratedWorkout.status, 201);

  const generatedSetIntent = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'I completed 12 reps',
      activeWorkoutId: generatedWorkout.id,
      activeExerciseId: generatedWorkout.exercises[0].id,
    }),
  });
  const generatedSetAction = await generatedSetIntent.json();
  assert.equal(generatedSetAction.action.type, 'ASK_SET_WEIGHT');
  assert.equal(generatedSetAction.action.reps, 12);

  const generatedSet = await fetch(`${baseUrl}/api/workouts/${generatedWorkout.id}/sets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      exerciseId: generatedSetAction.action.exerciseId,
      setNumber: generatedSetAction.action.setNumber,
      reps: generatedSetAction.action.reps,
      weightKg: 8,
    }),
  });
  assert.equal(generatedSet.status, 201);
  const finishGeneratedWorkout = await fetch(`${baseUrl}/api/workouts/${generatedWorkout.id}/finish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ durationSeconds: 0 }),
  });
  assert.equal(finishGeneratedWorkout.status, 200);

  const otherRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Another User',
      email: 'another-voice-test@example.com',
      password: 'secure-password-456',
      age: 30,
      heightCm: 170,
      currentWeightKg: 70,
      fitnessGoal: 'MAINTAIN_WEIGHT',
    }),
  });
  const { token: otherToken } = await otherRegistration.json();
  const otherCommand = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherToken}` },
    body: JSON.stringify({ message: 'Pause timer', activeWorkoutId: workout.id }),
  });
  assert.match((await otherCommand.json()).response, /Open one of your active workouts/);

  const providerRequests = [];
  const providerServer = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      providerRequests.push(payload);
      if (payload.messages[1].content === 'trigger provider failure') {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'unavailable' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: 'Use steady, balanced training and rest.' } }],
      }));
    });
  });
  providerServer.listen(0);
  await new Promise((resolve) => providerServer.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => providerServer.close((error) => error ? reject(error) : resolve())));
  const originalEnvironment = {
    enabled: process.env.AI_ENABLED,
    url: process.env.AI_API_URL,
    key: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
  };
  process.env.AI_ENABLED = 'true';
  process.env.AI_API_URL = `http://127.0.0.1:${providerServer.address().port}/chat/completions`;
  process.env.AI_API_KEY = 'test-only-key';
  process.env.AI_MODEL = 'local-test-model';

  const noConsent = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'What is progressive overload?' }),
  });
  assert.equal((await noConsent.json()).aiStatus, 'offline');
  assert.equal(providerRequests.length, 0, 'unrecognized questions are not sent without explicit opt-in');

  const optedIn = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'What is progressive overload?', allowAI: true }),
  });
  const aiResult = await optedIn.json();
  assert.equal(aiResult.aiStatus, 'used', JSON.stringify(aiResult));
  assert.equal(aiResult.response, 'Use steady, balanced training and rest.');
  assert.equal(aiResult.action, undefined, 'provider output cannot create app actions');
  assert.deepEqual(providerRequests[0].messages[1], { role: 'user', content: 'What is progressive overload?' });
  assert.equal(JSON.stringify(providerRequests[0]).includes('Voice Test'), false);

  const failedProvider = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'trigger provider failure', allowAI: true }),
  });
  assert.equal((await failedProvider.json()).aiStatus, 'unavailable');
  process.env.AI_ENABLED = originalEnvironment.enabled;
  process.env.AI_API_URL = originalEnvironment.url;
  process.env.AI_API_KEY = originalEnvironment.key;
  process.env.AI_MODEL = originalEnvironment.model;

  const unexpectedField = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'open dashboard', ownerId: 'another-user' }),
  });
  assert.equal(unexpectedField.status, 400);
});
