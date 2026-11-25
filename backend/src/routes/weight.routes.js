import { Router } from 'express';
import { createWeightEntry, getWeightHistory } from '../controllers/progress.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.post('/', createWeightEntry);
router.get('/history', getWeightHistory);

export default router;
