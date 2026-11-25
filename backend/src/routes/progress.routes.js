import { Router } from 'express';
import {
  getDashboard,
  getMuscleSplit,
  getOverallProgress,
  getRecords,
  getStrength,
  getWeeklyVolume,
} from '../controllers/progress.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.get('/dashboard', getDashboard);
router.get('/weekly-volume', getWeeklyVolume);
router.get('/strength', getStrength);
router.get('/muscle-split', getMuscleSplit);
router.get('/records', getRecords);
router.get('/overall', getOverallProgress);

export default router;
