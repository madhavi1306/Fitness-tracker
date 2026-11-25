import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { loginSchema, publicUser, registerSchema } from '../utils/validation.js';

function issueToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: userId,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export async function register(req, res, next) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please check the highlighted fields', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        passwordHash,
        age: parsed.data.age,
        heightCm: parsed.data.heightCm,
        currentWeightKg: parsed.data.currentWeightKg,
        targetWeightKg: parsed.data.targetWeightKg ?? null,
        fitnessGoal: parsed.data.fitnessGoal,
      },
    });
    return res.status(201).json({ token: issueToken(user.id), user: publicUser(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    return next(error);
  }
}

export async function login(req, res, next) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter a valid email and password' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const passwordMatches = user && await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }
    return res.json({ token: issueToken(user.id), user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
}

export function me(req, res) {
  return res.json({ user: publicUser(req.user) });
}
