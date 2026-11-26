import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MEMORY_MODE = 'true';
process.env.PGLITE_MODE = 'false';
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const { app } = await import('../src/app.js');

test('voice navigation, diet plans and progress summaries use authenticated actions', async (context) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Voice Completion Test',
      email: 'voice-completion@example.com',
      password: 'secure-password-123',
      age: 28,
      heightCm: 172,
      currentWeightKg: 72,
      fitnessGoal: 'MAINTAIN_WEIGHT',
      dietaryPreference: 'VEGETARIAN',
    }),
  });
  assert.equal(registered.status, 201);
  const { token } = await registered.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const navigationMessages = [
    ['Open exercise library', '/app/exercises'],
    ['Open exercise library and show leg exercises', '/app/exercises?muscleGroup=Legs'],
    ['Workout planner', '/app/planner?date=2026-11-26&view=WEEKLY'],
    ['Nutrition', '/app/diet'],
    ['Overall', '/app/progress'],
    ['Workout history', '/app/workouts/history'],
  ];
  const generatePagePlan = await fetch(`${baseUrl}/api/nutrition/diet-plans/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-11-26',
      goal: 'WEIGHT_LOSS',
      dietaryPreference: 'VEGETARIAN',
      request: 'Create a vegetarian weight loss nutrition plan',
    }),
  });
  assert.equal(generatePagePlan.status, 200);
  const pagePlanResult = await generatePagePlan.json();
  assert.equal(pagePlanResult.plan.meals.length, 4);
  assert.equal(pagePlanResult.plan.dietaryPreference, 'VEGETARIAN');
  assert.equal(pagePlanResult.generationMethod, 'database_library');

  const savePagePlan = await fetch(`${baseUrl}/api/nutrition/diet-plans`, {
    method: 'POST',
    headers,
    body: JSON.stringify(pagePlanResult.plan),
  });
  assert.equal(savePagePlan.status, 201);
  const firstSavedPlan = await savePagePlan.json();
  const repeatedSave = await fetch(`${baseUrl}/api/nutrition/diet-plans`, {
    method: 'POST',
    headers,
    body: JSON.stringify(pagePlanResult.plan),
  });
  assert.equal(repeatedSave.status, 200);
  assert.equal((await repeatedSave.json()).plan.id, firstSavedPlan.plan.id);

  const listPagePlans = await fetch(`${baseUrl}/api/nutrition/diet-plans`, { headers });
  assert.equal(listPagePlans.status, 200);
  assert.equal((await listPagePlans.json()).plans.length, 1);

  const generatedWeek = await fetch(`${baseUrl}/api/nutrition/diet-plans/generate-week`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-11-26',
      goal: 'WEIGHT_LOSS',
      dietaryPreference: 'VEGETARIAN',
      request: 'Create a vegetarian weekly diet plan for weight loss',
    }),
  });
  assert.equal(generatedWeek.status, 200);
  const generatedWeekResult = await generatedWeek.json();
  assert.equal(generatedWeekResult.plans.length, 7);
  assert.deepEqual(generatedWeekResult.plans.map((plan) => plan.date), [
    '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
    '2026-11-30', '2026-12-01', '2026-12-02',
  ]);
  assert.ok(generatedWeekResult.plans.every((plan) => plan.meals.length === 4));

  const voiceWeek = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Create my weekly diet plan', date: '2026-11-26' }),
  });
  const voiceWeekResult = await voiceWeek.json();
  assert.equal(voiceWeekResult.action?.type, 'SHOW_DIET_WEEK');
  assert.equal(voiceWeekResult.data?.plans?.length, 7);

  const saveWeek = await fetch(`${baseUrl}/api/nutrition/diet-plans/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plans: generatedWeekResult.plans }),
  });
  assert.equal(saveWeek.status, 201);
  assert.equal((await saveWeek.json()).plans.length, 7);
  const repeatedWeekSave = await fetch(`${baseUrl}/api/nutrition/diet-plans/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plans: generatedWeekResult.plans }),
  });
  assert.equal(repeatedWeekSave.status, 200);
  const persistedWeek = await (await fetch(`${baseUrl}/api/nutrition/diet-plans`, { headers })).json();
  assert.equal(persistedWeek.plans.length, 7);

  for (const [message, path] of navigationMessages) {
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, date: '2026-11-26' }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.action?.type, 'NAVIGATE');
    assert.equal(result.action.path, path);
  }

  const diet = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Create my nutrition plan for today', date: '2026-11-26' }),
  });
  assert.equal(diet.status, 200);
  const dietResult = await diet.json();
  assert.equal(dietResult.action?.type, 'SHOW_DIET_PLAN');
  assert.equal(dietResult.data?.plan?.meals?.length, 4);

  const logPlannedBreakfast = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Log my breakfast',
      date: '2026-11-26',
      currentDietPlan: dietResult.data.plan,
    }),
  });
  const logPlannedBreakfastResult = await logPlannedBreakfast.json();
  assert.equal(logPlannedBreakfastResult.action?.type, 'CONFIRM_FOOD');
  assert.equal(logPlannedBreakfastResult.action?.mealType, 'BREAKFAST');
  assert.ok(logPlannedBreakfastResult.action?.items.length > 0);

  for (const message of [
    'Create my nutrition plan',
    'Create my diet plan for today',
    'Plan my meals for today',
    'Give me a diet plan for weight loss',
    'Give me a diet plan for weight gain',
    'Create a muscle gain diet plan',
    'Give me a vegetarian diet plan',
    'Give me a high-protein diet plan',
    'What should I eat today?',
  ]) {
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, date: '2026-11-26' }),
    });
    const result = await response.json();
    assert.equal(result.action?.type, 'SHOW_DIET_PLAN', `${message} should create a nutrition plan`);
    assert.equal(result.data?.plan?.meals?.length, 4);
    if (/vegetarian/i.test(message)) assert.equal(result.data.plan.dietaryPreference, 'VEGETARIAN');
    if (/weight loss/i.test(message)) assert.equal(result.data.plan.goal, 'WEIGHT_LOSS');
    if (/weight gain/i.test(message)) assert.equal(result.data.plan.goal, 'WEIGHT_GAIN');
    if (/muscle gain/i.test(message)) assert.equal(result.data.plan.goal, 'BUILD_STRENGTH');
    if (/high-protein/i.test(message)) assert.ok(result.data.plan.targetProteinGrams >= 115);
  }

  const voiceWeekCreation = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Create my weekly nutrition plan', date: '2026-11-26' }),
  });
  assert.equal((await voiceWeekCreation.json()).action?.type, 'SHOW_DIET_WEEK');

  const gainMuscleNutrition = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'I want to gain muscle, plan my food',
      date: '2026-11-26',
      timezoneOffsetMinutes: -330,
    }),
  });
  const gainMuscleResult = await gainMuscleNutrition.json();
  assert.equal(gainMuscleResult.action?.type, 'SHOW_DIET_PLAN');
  assert.equal(gainMuscleResult.data?.plan?.goal, 'BUILD_STRENGTH');

  const combinedNutrition = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Go to nutrition and show my protein',
      date: '2026-11-26',
      timezoneOffsetMinutes: -330,
    }),
  });
  const combinedNutritionResult = await combinedNutrition.json();
  assert.equal(combinedNutritionResult.action?.type, 'SHOW_NUTRITION');
  assert.equal(combinedNutritionResult.action.path, '/app/diet');
  assert.ok(Number.isFinite(combinedNutritionResult.data?.totals?.proteinGrams));

  const createTemplatePlan = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Create a leg workout template', date: '2026-11-26' }),
  });
  const templatePlanResult = await createTemplatePlan.json();
  assert.equal(templatePlanResult.action?.type, 'SHOW_WORKOUT_PLAN');
  assert.ok(templatePlanResult.data?.plan?.targetMuscles.includes('Legs'));

  const savedBefore = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Show my saved diet plans' }),
  });
  const savedBeforeResult = await savedBefore.json();
  assert.match(savedBeforeResult.response, /saved diet plan/i);

  const saved = await fetch(`${baseUrl}/api/nutrition/diet-plans`, {
    method: 'POST',
    headers,
    body: JSON.stringify(dietResult.data.plan),
  });
  assert.equal(saved.status, 200);

  const savedAfter = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Show my saved diet plans' }),
  });
  assert.match((await savedAfter.json()).response, /saved diet plan/i);

  for (const message of [
    'Show my daily progress',
    'Show my weekly progress',
    'Show my monthly progress',
  ]) {
    const progress = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, date: '2026-11-26' }),
    });
    assert.equal(progress.status, 200);
    const result = await progress.json();
    assert.equal(result.action?.type, 'SHOW_PROGRESS', JSON.stringify(result));
    assert.ok(result.action.path === '/app/progress');
    assert.ok(Array.isArray(result.action.data.workouts.activityByDay));
    assert.ok(Number.isFinite(result.action.data.nutrition.caloriesTargetForPeriod));
  }

  const today = new Date().toISOString().slice(0, 10);
  const { foods } = await (await fetch(`${baseUrl}/api/foods/search?search=Egg`, { headers })).json();
  const egg = foods.find((food) => food.name === 'Egg');
  const loggedFood = await fetch(`${baseUrl}/api/nutrition/food`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ foodId: egg.id, quantity: 2, mealType: 'BREAKFAST', date: today }),
  });
  assert.equal(loggedFood.status, 201);

  const { exercises } = await (await fetch(`${baseUrl}/api/exercises`, { headers })).json();
  const templateResponse = await fetch(`${baseUrl}/api/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Progress verification workout',
      exercises: [{ exerciseId: exercises[0].id, sets: 1, targetReps: 8, targetWeightKg: 20, restSeconds: 30 }],
    }),
  });
  const { template } = await templateResponse.json();
  const started = await fetch(`${baseUrl}/api/workouts/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ templateId: template.id }),
  });
  const { workout } = await started.json();
  const loggedSet = await fetch(`${baseUrl}/api/workouts/${workout.id}/sets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      exerciseId: workout.exercises[0].id,
      setNumber: 1,
      reps: 8,
      weightKg: 20,
    }),
  });
  assert.equal(loggedSet.status, 201);
  const finished = await fetch(`${baseUrl}/api/workouts/${workout.id}/finish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ durationSeconds: 0 }),
  });
  assert.equal(finished.status, 200);

  const actualProgress = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Show my daily progress',
      date: today,
      timezoneOffsetMinutes: 0,
    }),
  });
  const actualProgressResult = await actualProgress.json();
  assert.equal(actualProgressResult.action.data.workouts.completed, 1);
  assert.equal(actualProgressResult.action.data.workouts.sets, 1);
  assert.equal(actualProgressResult.action.data.workouts.volumeKg, 160);
  assert.ok(actualProgressResult.action.data.nutrition.calories > 0);

  const overallProgressPage = await fetch(`${baseUrl}/api/progress/overall?range=allTime`, { headers });
  const overallProgress = await overallProgressPage.json();
  assert.equal(overallProgress.nutrition.loggedEntries, 1);
  assert.ok(overallProgress.nutrition.calories > 0);
  assert.equal(overallProgress.nutrition.proteinGrams, actualProgressResult.action.data.nutrition.proteinGrams);
});
