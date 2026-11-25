import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '16kb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use(notFound);
app.use(errorHandler);
