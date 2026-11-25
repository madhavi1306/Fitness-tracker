import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errorHandler.js';

function invokeErrorHandler(error) {
  const result = { statusCode: 200, body: null };
  const response = {
    headersSent: false,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  errorHandler(error, {}, response, (nextError) => { throw nextError; });
  return result;
}

test('database connection failures return setup guidance instead of a generic error', () => {
  const result = invokeErrorHandler(Object.assign(new Error('connection refused'), {
    name: 'PrismaClientInitializationError',
  }));
  assert.equal(result.statusCode, 503);
  assert.match(result.body.error, /Start PostgreSQL/);
  assert.ok(result.body.error.includes('backend/.env'));
});

test('unapplied database schema returns migration guidance', () => {
  const result = invokeErrorHandler(Object.assign(new Error('table does not exist'), { code: 'P2021' }));
  assert.equal(result.statusCode, 503);
  assert.match(result.body.error, /npm run db:migrate/);
});
