import { Router } from 'express';
import { getAll, create } from '../controllers/category.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();
router.get('/', authenticate, getAll);
router.post('/', authenticate, requireAdmin, create);

export default router;
