// ============================================================
//  RUTAS DE CATEGORÍAS (category.routes.ts)
//  Todos los endpoints requieren token válido (authenticate).
//  Solo Admin puede crear categorías (requireAdmin).
//
//  GET  /api/categories  → Listar todas (cualquier usuario autenticado)
//  POST /api/categories  → Crear nueva  (solo Admin)
// ============================================================

import { Router } from 'express';
import { getAll, create } from '../controllers/category.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

// authenticate verifica el token → cualquier usuario logueado puede listar
router.get('/',  authenticate,              getAll);

// authenticate + requireAdmin → solo Admin puede crear categorías
router.post('/', authenticate, requireAdmin, create);

export default router;
