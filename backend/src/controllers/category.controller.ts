// ============================================================
//  CONTROLADOR DE CATEGORÍAS (category.controller.ts)
//  Gestiona las peticiones HTTP relacionadas con categorías.
//  Solo hay dos operaciones: listar y crear.
// ============================================================

import { Request, Response } from 'express';
import * as categoryService from '../services/category.service';

/**
 * getAll — Maneja GET /api/categories
 * Devuelve la lista completa de categorías ordenadas alfabéticamente.
 * No requiere parámetros.
 *
 * Respuesta 200: [{ id, name }, ...]
 */
export const getAll = async (_req: Request, res: Response): Promise<void> => {
  // _req tiene guión bajo porque no usamos el request (no hay params ni body)
  const categories = await categoryService.getAll();
  res.json(categories);
};

/**
 * create — Maneja POST /api/categories
 * Crea una nueva categoría. Solo accesible por Admin (según la ruta).
 *
 * Body esperado: { name: string }
 * Respuesta 201: { id, name }
 * Respuesta 400: { message: "error" } si el nombre ya existe
 */
export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const category = await categoryService.create(req.body.name);
    res.status(201).json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
