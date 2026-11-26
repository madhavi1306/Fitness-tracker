import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ASSISTANT_SYSTEM_PROMPT } from '../src/controllers/assistant.controller.js';

process.env.MEMORY_MODE = 'true';
process.env.PGLITE_MODE = 'false';
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const { app } = await import('../src/app.js');

test('authenticated conversational assistant sends only the question and handles provider failures', async (context) => {
  const providerRequests = [];
  const provider = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      providerRequests.push(payload);
      const question = payload.messages?.at(-1)?.content;
      if (question === 'simulate provider failure') {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'unavailable' }));
        return;
      }
      const answer = question === 'simulate empty reply' ? '  ' : 'Hi! What can I help you with today?';
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: answer } }] }));
    });
  });
  provider.listen(0, '127.0.0.1');
  await new Promise((resolve) => provider.once('listening', resolve));

  const api = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => api.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${api.address().port}`;
  const previousEnvironment = {
    enabled: process.env.AI_ENABLED,
    url: process.env.AI_API_URL,
    key: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
  };
  process.env.AI_ENABLED = 'true';
  process.env.AI_API_URL = `http://127.0.0.1:${provider.address().port}/chat/completions`;
  process.env.AI_API_KEY = 'test-only-key';
  process.env.AI_MODEL = 'local-test-model';

  context.after(async () => {
    for (const [key, value] of Object.entries({
      AI_ENABLED: previousEnvironment.enabled,
      AI_API_URL: previousEnvironment.url,
      AI_API_KEY: previousEnvironment.key,
      AI_MODEL: previousEnvironment.model,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all([
      new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve())),
      new Promise((resolve, reject) => provider.close((error) => error ? reject(error) : resolve())),
    ]);
  });

  const credentials = {
    fullName: 'Assistant Endpoint Test',
    email: `assistant-${randomUUID()}@example.test`,
    password: 'secure-password-123',
    age: 30,
    heightCm: 170,
    currentWeightKg: 70,
    fitnessGoal: 'MAINTAIN_WEIGHT',
  };
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert.equal(registration.status, 201);
  const { token } = await registration.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const unauthorized = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hi' }),
  });
  assert.equal(unauthorized.status, 401);

  const extraData = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Hi', profile: credentials.fullName }),
  });
  assert.equal(extraData.status, 400);
  assert.equal(providerRequests.length, 0);

  const invalidHistory = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Hi',
      history: Array.from({ length: 9 }, () => ({ role: 'user', content: 'hello' })),
    }),
  });
  assert.equal(invalidHistory.status, 400);

  const valid = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Hi' }),
  });
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), {
    response: 'Hi! What can I help you with today?',
    aiStatus: 'used',
  });
  assert.equal(providerRequests[0].messages[0].content, ASSISTANT_SYSTEM_PROMPT);
  assert.deepEqual(providerRequests[0].messages.at(-1), { role: 'user', content: 'Hi' });
  assert.equal(JSON.stringify(providerRequests[0]).includes(credentials.fullName), false);
  assert.equal(JSON.stringify(providerRequests[0]).includes(credentials.email), false);

  const followUp = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'What about tomorrow?',
      history: [
        { role: 'user', content: 'I want to gain weight. Suggest a meal.' },
        { role: 'assistant', content: 'Try a balanced meal with protein and carbohydrates.' },
      ],
    }),
  });
  assert.equal(followUp.status, 200);
  assert.deepEqual(providerRequests[1].messages.slice(-3), [
    { role: 'user', content: 'I want to gain weight. Suggest a meal.' },
    { role: 'assistant', content: 'Try a balanced meal with protein and carbohydrates.' },
    { role: 'user', content: 'What about tomorrow?' },
  ]);
  assert.equal(JSON.stringify(providerRequests[1]).includes(credentials.fullName), false);
  assert.equal(JSON.stringify(providerRequests[1]).includes(credentials.email), false);

  const kannadaReply = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Tell me how to warm up.', language: 'kn-IN' }),
  });
  assert.equal(kannadaReply.status, 200);
  assert.ok(providerRequests[2].messages.some((entry) => /Reply naturally in Kannada/.test(entry.content)));

  const empty = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'simulate empty reply' }),
  });
  assert.equal(empty.status, 502);
  assert.match((await empty.json()).error, /empty reply/i);

  const providerFailure = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'simulate provider failure' }),
  });
  assert.equal(providerFailure.status, 502);
  assert.match((await providerFailure.json()).error, /could not answer/i);

  process.env.AI_ENABLED = 'false';
  const notConfigured = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'How do I build strength?' }),
  });
  assert.equal(notConfigured.status, 503);
  assert.match((await notConfigured.json()).error, /AI_API_KEY/);
});
