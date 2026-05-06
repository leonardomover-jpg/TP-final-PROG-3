// ============================================================
//  MIDDLEWARE DE AUTENTICACIÓN (auth.ts)
//  Un middleware es una función que se ejecuta ANTES del controlador.
//  Acá verificamos que el usuario esté autenticado y tenga el rol correcto
//  antes de permitir el acceso a un endpoint protegido.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Clave secreta para firmar y verificar los tokens JWT
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Extendemos el tipo Request de Express para poder adjuntarle
// los datos del usuario autenticado (id y rol) y usarlos en los controladores
export interface AuthRequest extends Request {
  userId?:   number; // ID del usuario extraído del token
  userRole?: string; // Rol del usuario ("Admin" o "User")
}

/**
 * Middleware: authenticate
 * Verifica que la petición incluya un token JWT válido en el encabezado Authorization.
 * Si el token es válido, adjunta el ID y rol del usuario al objeto `req` y pasa al siguiente paso.
 * Si no hay token o es inválido, responde con error 401 (No autorizado).
 *
 * Uso en rutas: router.get('/ruta', authenticate, controlador)
 * El token debe venir en el header: Authorization: Bearer <token>
 */
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  // Extraemos el token del header "Authorization: Bearer <token>"
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Token no proporcionado' });
    return;
  }

  try {
    // jwt.verify lanza una excepción si el token es inválido o expiró
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; role: string };

    // Guardamos los datos del usuario en el request para usarlos en el controlador
    req.userId   = decoded.id;
    req.userRole = decoded.role;

    // Llamamos a next() para continuar al siguiente middleware o controlador
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido' });
  }
};

/**
 * Middleware: requireAdmin
 * Se usa DESPUÉS de `authenticate`. Verifica que el usuario autenticado tenga rol "Admin".
 * Si no es Admin, responde con error 403 (Prohibido).
 * Si es Admin, permite continuar.
 *
 * Uso en rutas: router.post('/ruta', authenticate, requireAdmin, controlador)
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.userRole !== 'Admin') {
    res.status(403).json({ message: 'Solo administradores' });
    return;
  }
  next();
};
