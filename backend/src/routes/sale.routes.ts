// ============================================================
//  RUTAS DE VENTAS (sale.routes.ts)
//  Ambos endpoints requieren token. Cualquier usuario puede vender y ver historial.
//
//  POST /api/sales  → Registrar nueva venta  (cualquier usuario autenticado)
//  GET  /api/sales  → Ver historial de ventas (cualquier usuario autenticado)
// ============================================================

import { Router } from 'express';
import { createSale, getAll } from '../controllers/sale.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.post('/', authenticate, createSale); // Registrar una venta nueva
router.get('/',  authenticate, getAll);     // Consultar historial de ventas

export default router;
