import { Router } from 'express';
import {
  addFoodLog,
  deleteFoodLog,
  getNutritionHistory,
  getNutritionTargets,
  getNutritionToday,
  saveNutritionTargets,
  updateFoodLog,
} from '../controllers/nutrition.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.get('/today', getNutritionToday);
router.post('/food', addFoodLog);
router.put('/food/:id', updateFoodLog);
router.delete('/food/:id', deleteFoodLog);
router.get('/history', getNutritionHistory);
router.get('/targets', getNutritionTargets);
router.post('/targets', saveNutritionTargets);

export default router;
