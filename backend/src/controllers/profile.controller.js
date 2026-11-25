import { prisma } from '../utils/prisma.js';
import { profileUpdateSchema, publicUser } from '../utils/validation.js';

export function getProfile(req, res) {
  return res.json({ user: publicUser(req.user) });
}

export async function updateProfile(req, res, next) {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please check the highlighted fields', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: parsed.data,
    });
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
}
