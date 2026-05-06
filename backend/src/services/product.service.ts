// ============================================================
//  SERVICIO DE PRODUCTOS (product.service.ts)
//  Maneja las operaciones CRUD sobre la tabla Product.
//  CRUD = Create (crear), Read (leer), Update (actualizar), Delete (borrar)
//  Todas las consultas incluyen los datos de la categoría relacionada.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * getAll — Devuelve todos los productos con su categoría, ordenados por nombre.
 * `include: { category: true }` hace un JOIN automático con la tabla Category.
 * @returns Lista de productos [{ id, name, price, stock, category: { id, name } }]
 */
export const getAll = () =>
  prisma.product.findMany({ include: { category: true }, orderBy: { name: 'asc' } });

/**
 * getById — Busca un producto por su ID.
 * @param id - ID del producto a buscar
 * @returns El producto encontrado con su categoría, o null si no existe
 */
export const getById = (id: number) =>
  prisma.product.findUnique({ where: { id }, include: { category: true } });

/**
 * create — Crea un nuevo producto en el inventario.
 * @param data - Objeto con { name, price, stock, categoryId }
 * @returns El producto creado con su categoría incluida
 */
export const create = (data: { name: string; price: number; stock: number; categoryId: number }) =>
  prisma.product.create({ data, include: { category: true } });

/**
 * update — Actualiza uno o varios campos de un producto existente.
 * Solo actualiza los campos que se envíen (todos son opcionales gracias al ?).
 * @param id   - ID del producto a modificar
 * @param data - Campos a actualizar (cualquier combinación de name, price, stock, categoryId)
 * @returns El producto actualizado con su categoría
 */
export const update = (
  id: number,
  data: { name?: string; price?: number; stock?: number; categoryId?: number }
) => prisma.product.update({ where: { id }, data, include: { category: true } });

/**
 * remove — Elimina un producto de la base de datos.
 * @param id - ID del producto a eliminar
 * @returns El producto eliminado (por si se necesita confirmar qué se borró)
 * @throws Error si el producto tiene ventas asociadas (restricción ON DELETE RESTRICT)
 */
export const remove = (id: number) =>
  prisma.product.delete({ where: { id } });
