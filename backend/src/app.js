import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import exerciseRoutes from './routes/exercise.routes.js';
import templateRoutes from './routes/template.routes.js';
import workoutRoutes from './routes/workout.routes.js';
import workoutPlanRoutes from './routes/workoutPlan.routes.js';
import progressRoutes from './routes/progress.routes.js';
import weightRoutes from './routes/weight.routes.js';
import nutritionRoutes from './routes/nutrition.routes.js';
import foodsRoutes from './routes/foods.routes.js';
import aiRoutes from './routes/ai.routes.js';
import assistantRoutes from './routes/assistant.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { prisma } from './utils/prisma.js';

export const app = express();
const memoryMode = process.env.MEMORY_MODE === 'true' && process.env.PGLITE_MODE !== 'true';

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '16kb' }));

app.get('/api/health', async (req, res) => {
  try {
    if (memoryMode) {
      await prisma.exercise.findFirst({ where: { ownerId: null }, select: { id: true } });
      return res.json({ status: 'ok', storage: 'memory' });
    }
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      status: 'ok',
      storage: process.env.PGLITE_MODE === 'true' ? 'pglite' : 'postgresql',
    });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    return res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/workout-plans', workoutPlanRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/weight', weightRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/foods', foodsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/assistant', assistantRoutes);
app.use(notFound);
app.use(errorHandler);
