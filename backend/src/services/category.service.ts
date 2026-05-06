// ============================================================
//  SERVICIO DE CATEGORÍAS (category.service.ts)
//  Maneja todas las operaciones de base de datos para la tabla Category.
//  Las categorías agrupan los productos del inventario.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * getAll — Obtiene todas las categorías ordenadas alfabéticamente.
 * @returns Lista de categorías [{ id, name }]
 */
export const getAll = () =>
  prisma.category.findMany({ orderBy: { name: 'asc' } });

/**
 * create — Crea una nueva categoría en la base de datos.
 * @param name - Nombre único de la categoría (ej: "Electrónica")
 * @returns La categoría creada con su ID asignado
 * @throws Error si ya existe una categoría con ese nombre (restricción @unique del schema)
 */
export const create = (name: string) =>
  prisma.category.create({ data: { name } });
