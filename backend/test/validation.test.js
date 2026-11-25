import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { loginSchema, profileUpdateSchema, publicUser, registerSchema } from '../src/utils/validation.js';

const validRegistration = {
  fullName: 'Jordan Lee',
  email: 'JORDAN@example.com',
  password: 'strong-pass-123',
  age: 29,
  heightCm: 173,
  currentWeightKg: 76,
  fitnessGoal: 'BUILD_STRENGTH',
};

test('registration validates fields and normalizes email', () => {
  const result = registerSchema.parse(validRegistration);
  assert.equal(result.email, 'jordan@example.com');
});

test('registration rejects weak passwords and out-of-range values', () => {
  assert.equal(registerSchema.safeParse({ ...validRegistration, password: 'short' }).success, false);
  assert.equal(registerSchema.safeParse({ ...validRegistration, age: 8 }).success, false);
});

test('login requires a valid email and non-empty password', () => {
  assert.equal(loginSchema.safeParse({ email: 'jordan@example.com', password: 'secret' }).success, true);
  assert.equal(loginSchema.safeParse({ email: 'invalid', password: 'secret' }).success, false);
});

test('profile update only accepts editable fields and requires at least one', () => {
  assert.equal(profileUpdateSchema.safeParse({ currentWeightKg: 74 }).success, true);
  assert.equal(profileUpdateSchema.safeParse({}).success, false);
  assert.equal(profileUpdateSchema.safeParse({ email: 'other@example.com' }).success, false);
});

test('bcrypt hashes can be verified and public users omit password hashes', async () => {
  const password = 'phase-one-password';
  const passwordHash = await bcrypt.hash(password, 4);
  assert.notEqual(passwordHash, password);
  assert.equal(await bcrypt.compare(password, passwordHash), true);
  assert.equal(await bcrypt.compare('incorrect-password', passwordHash), false);
  assert.deepEqual(publicUser({ id: 'user-id', email: 'jordan@example.com', passwordHash }), {
    id: 'user-id',
    email: 'jordan@example.com',
  });
});
