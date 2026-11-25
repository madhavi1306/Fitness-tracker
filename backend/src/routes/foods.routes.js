import { Router } from 'express';
import { createCustomFood, listFoods } from '../controllers/nutrition.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.get('/', listFoods);
router.get('/search', listFoods);
router.post('/', createCustomFood);

export default router;
