// ============================================================
//  RUTAS DE PRODUCTOS (product.routes.ts)
//  Las operaciones de lectura (GET) son accesibles por cualquier usuario.
//  Las operaciones de escritura (POST/PUT/DELETE) son solo para Admin.
//
//  GET    /api/products      → Listar todos        (cualquier usuario)
//  GET    /api/products/:id  → Ver uno por ID      (cualquier usuario)
//  POST   /api/products      → Crear producto      (solo Admin)
//  PUT    /api/products/:id  → Editar producto     (solo Admin)
//  DELETE /api/products/:id  → Eliminar producto   (solo Admin)
// ============================================================

import { Router } from 'express';
import { getAll, getById, create, update, remove } from '../controllers/product.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

// Lectura: cualquier usuario autenticado
router.get('/',    authenticate,              getAll);
router.get('/:id', authenticate,              getById);

// Escritura: solo Admin
router.post('/',    authenticate, requireAdmin, create);
router.put('/:id',  authenticate, requireAdmin, update);
router.delete('/:id', authenticate, requireAdmin, remove);

export default router;
