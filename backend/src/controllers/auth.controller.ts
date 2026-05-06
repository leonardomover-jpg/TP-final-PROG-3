// ============================================================
//  CONTROLADOR DE AUTENTICACIÓN (auth.controller.ts)
//  Los controladores reciben la petición HTTP (req), llaman al servicio
//  correspondiente y envían la respuesta HTTP (res).
//  Son el puente entre las rutas y la lógica de negocio (servicios).
// ============================================================

import { Request, Response } from 'express';
import * as authService from '../services/auth.service';

/**
 * register — Maneja POST /api/auth/register
 * Recibe email, password y role del body y crea un nuevo usuario.
 *
 * Body esperado: { email: string, password: string, role?: string }
 * Respuesta 201: { id, email, role }
 * Respuesta 400: { message: "error" } si el email ya existe u otro error
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, role } = req.body;
    const user = await authService.register(email, password, role);

    // 201 Created: el recurso fue creado exitosamente
    // No devolvemos la contraseña hasheada por seguridad
    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * login — Maneja POST /api/auth/login
 * Verifica credenciales y devuelve un token JWT si son correctas.
 *
 * Body esperado: { email: string, password: string }
 * Respuesta 200: { token: string, user: { id, email, role } }
 * Respuesta 401: { message: "error" } si las credenciales son incorrectas
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    // Devuelve el token JWT que el frontend guardará en localStorage
    res.json(result);
  } catch (error: any) {
    // 401 Unauthorized: credenciales incorrectas
    res.status(401).json({ message: error.message });
  }
};
