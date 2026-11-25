import { Router } from 'express';
import {
  createExercise,
  deleteExercise,
  getExercise,
  listExercises,
  updateExercise,
} from '../controllers/exercise.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.get('/', listExercises);
router.get('/:id', getExercise);
router.post('/', createExercise);
router.put('/:id', updateExercise);
router.delete('/:id', deleteExercise);

export default router;
