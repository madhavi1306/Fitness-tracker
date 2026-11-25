import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

let server;
let baseUrl;

test('API health and protected routes respond with expected status codes', async (context) => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const profile = await fetch(`${baseUrl}/api/profile`);
  assert.equal(profile.status, 401);
  assert.equal((await profile.json()).error, 'Authentication required');

  const profileUpdate = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentWeightKg: 70 }),
  });
  assert.equal(profileUpdate.status, 401);

  const invalidRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(invalidRegistration.status, 400);

  const invalidLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'anything' }),
  });
  assert.equal(invalidLogin.status, 400);

  const me = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(me.status, 401);

  const protectedRoutes = [
    ['/api/exercises', 'GET'],
    ['/api/exercises', 'POST'],
    ['/api/exercises/example', 'GET'],
    ['/api/templates', 'GET'],
    ['/api/templates', 'POST'],
    ['/api/templates/example', 'PUT'],
    ['/api/workouts/start', 'POST'],
    ['/api/workouts/history', 'GET'],
    ['/api/workouts/example', 'GET'],
    ['/api/workouts/example/sets', 'POST'],
    ['/api/workouts/example/finish', 'POST'],
    ['/api/progress/dashboard', 'GET'],
    ['/api/progress/weekly-volume', 'GET'],
    ['/api/progress/strength', 'GET'],
    ['/api/progress/muscle-split', 'GET'],
    ['/api/progress/records', 'GET'],
    ['/api/progress/overall', 'GET'],
    ['/api/weight', 'POST'],
    ['/api/weight/history', 'GET'],
    ['/api/nutrition/today', 'GET'],
    ['/api/nutrition/food', 'POST'],
    ['/api/nutrition/food/example', 'PUT'],
    ['/api/nutrition/food/example', 'DELETE'],
    ['/api/nutrition/history', 'GET'],
    ['/api/nutrition/targets', 'GET'],
    ['/api/nutrition/targets', 'POST'],
    ['/api/foods', 'GET'],
    ['/api/foods/search', 'GET'],
    ['/api/foods', 'POST'],
  ];
  for (const [path, method] of protectedRoutes) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({}),
    });
    assert.equal(response.status, 401, `${method} ${path} must require authentication`);
  }
});
