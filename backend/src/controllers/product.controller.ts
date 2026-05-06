// ============================================================
//  CONTROLADOR DE PRODUCTOS (product.controller.ts)
//  Gestiona todas las operaciones CRUD sobre productos.
//  Las rutas de escritura (crear/editar/borrar) requieren rol Admin.
// ============================================================

import { Request, Response } from 'express';
import * as productService from '../services/product.service';

/**
 * getAll — Maneja GET /api/products
 * Devuelve todos los productos con su categoría, ordenados por nombre.
 *
 * Respuesta 200: [{ id, name, price, stock, category: { id, name } }, ...]
 */
export const getAll = async (_req: Request, res: Response): Promise<void> => {
  const products = await productService.getAll();
  res.json(products);
};

/**
 * getById — Maneja GET /api/products/:id
 * Busca y devuelve un único producto por su ID.
 *
 * Parámetro de ruta: id (número)
 * Respuesta 200: { id, name, price, stock, category }
 * Respuesta 404: { message: "Producto no encontrado" }
 */
export const getById = async (req: Request, res: Response): Promise<void> => {
  // req.params.id llega como string, lo convertimos a número con Number()
  const product = await productService.getById(Number(req.params.id));

  if (!product) {
    res.status(404).json({ message: 'Producto no encontrado' });
    return;
  }
  res.json(product);
};

/**
 * create — Maneja POST /api/products (solo Admin)
 * Crea un nuevo producto en el inventario.
 *
 * Body esperado: { name: string, price: number, stock: number, categoryId: number }
 * Respuesta 201: El producto creado con su categoría
 * Respuesta 400: { message: "error" } si los datos son inválidos
 */
export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await productService.create(req.body);
    res.status(201).json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * update — Maneja PUT /api/products/:id (solo Admin)
 * Actualiza los datos de un producto existente.
 * Solo se modifican los campos que se envíen en el body.
 *
 * Parámetro de ruta: id (número)
 * Body: cualquier combinación de { name?, price?, stock?, categoryId? }
 * Respuesta 200: El producto actualizado con su categoría
 * Respuesta 400: { message: "error" } si el producto no existe
 */
export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await productService.update(Number(req.params.id), req.body);
    res.json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * remove — Maneja DELETE /api/products/:id (solo Admin)
 * Elimina un producto del inventario permanentemente.
 *
 * Parámetro de ruta: id (número)
 * Respuesta 204: Sin contenido (borrado exitoso)
 * Respuesta 400: { message: "error" } si tiene ventas asociadas o no existe
 */
export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    await productService.remove(Number(req.params.id));
    // 204 No Content: operación exitosa sin cuerpo de respuesta
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
