import { Router } from 'express';
import {
  addFoodLog,
  deleteFoodLog,
  getNutritionHistory,
  getNutritionTargets,
  getNutritionToday,
  saveNutritionTargets,
  listDietPlans,
  getDietPlan,
  saveDietPlan,
  deleteDietPlan,
  generateDietPlanRequest,
  generateDietPlanWeekRequest,
  saveDietPlanBatch,
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
router.get('/diet-plans', listDietPlans);
router.post('/diet-plans/generate-week', generateDietPlanWeekRequest);
router.post('/diet-plans/generate', generateDietPlanRequest);
router.post('/diet-plans/batch', saveDietPlanBatch);
router.post('/diet-plans', saveDietPlan);
router.get('/diet-plans/:id', getDietPlan);
router.delete('/diet-plans/:id', deleteDietPlan);

export default router;
