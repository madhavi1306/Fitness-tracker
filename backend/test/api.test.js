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
});
