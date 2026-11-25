import { Router } from 'express';
import {
  finishWorkout,
  getWorkout,
  listWorkoutHistory,
  logSet,
  startWorkout,
} from '../controllers/workout.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.post('/start', startWorkout);
router.get('/history', listWorkoutHistory);
router.get('/:id', getWorkout);
router.post('/:id/sets', logSet);
router.post('/:id/finish', finishWorkout);

export default router;
