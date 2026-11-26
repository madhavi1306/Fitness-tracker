import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { chat } from '../controllers/ai.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many assistant requests. Please wait a minute and try again.' },
});

router.post('/chat', authenticate, chatLimiter, chat);

export default router;
