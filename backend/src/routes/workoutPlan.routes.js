import { Router } from 'express';
import {
  completeWorkoutPlanDay,
  deleteWorkoutPlan,
  generateWorkoutPlanRequest,
  getWorkoutPlan,
  listWorkoutPlans,
  saveWorkoutPlan,
  updateWorkoutPlanDay,
} from '../controllers/workoutPlan.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.get('/', listWorkoutPlans);
router.post('/generate', generateWorkoutPlanRequest);
router.post('/', saveWorkoutPlan);
router.get('/:id', getWorkoutPlan);
router.patch('/:id/days/:dayId', updateWorkoutPlanDay);
router.post('/:id/days/:dayId/complete', completeWorkoutPlanDay);
router.delete('/:id', deleteWorkoutPlan);

export default router;
