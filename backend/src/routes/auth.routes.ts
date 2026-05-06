// ============================================================
//  RUTAS DE AUTENTICACIÓN (auth.routes.ts)
//  Define los endpoints públicos para registrarse e iniciar sesión.
//  Estos endpoints NO requieren token (son los únicos que no usan `authenticate`).
//
//  POST /api/auth/register  → Crear cuenta nueva
//  POST /api/auth/login     → Iniciar sesión, obtener token JWT
// ============================================================

import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';

const router = Router();

router.post('/register', register); // Crear cuenta nueva
router.post('/login',    login);    // Iniciar sesión → devuelve token

export default router;
