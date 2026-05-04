import { Router } from 'express';
import { createSale, getAll } from '../controllers/sale.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();
router.post('/', authenticate, createSale);
router.get('/', authenticate, getAll);

export default router;
