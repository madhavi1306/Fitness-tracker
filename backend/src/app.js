import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import exerciseRoutes from './routes/exercise.routes.js';
import templateRoutes from './routes/template.routes.js';
import workoutRoutes from './routes/workout.routes.js';
import progressRoutes from './routes/progress.routes.js';
import weightRoutes from './routes/weight.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '16kb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/weight', weightRoutes);
app.use(notFound);
app.use(errorHandler);
