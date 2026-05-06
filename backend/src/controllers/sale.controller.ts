// ============================================================
//  CONTROLADOR DE VENTAS (sale.controller.ts)
//  Gestiona el registro de nuevas ventas y la consulta del historial.
//  Usa AuthRequest en lugar de Request para acceder al userId del token.
// ============================================================

import { Request, Response } from 'express';
import * as saleService from '../services/sale.service';
import { AuthRequest } from '../middlewares/auth';

/**
 * createSale — Maneja POST /api/sales
 * Registra una nueva venta con los ítems del carrito.
 * El ID del usuario vendedor se obtiene del token JWT (no del body).
 *
 * Body esperado: { items: [{ productId: number, quantity: number }, ...] }
 * Respuesta 201: La venta creada con todos sus detalles
 * Respuesta 400: { message: "error" } si hay stock insuficiente u otro problema
 *
 * req.userId! → el "!" indica que estamos seguros de que userId existe
 * porque el middleware `authenticate` lo validó antes de llegar acá
 */
export const createSale = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sale = await saleService.createSale(req.userId!, req.body.items);
    res.status(201).json(sale);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * getAll — Maneja GET /api/sales
 * Devuelve el historial completo de ventas (todas las del sistema).
 * Incluye el email del vendedor y el detalle de cada producto.
 *
 * Respuesta 200: [{ id, total, createdAt, user: { email }, details: [...] }, ...]
 */
export const getAll = async (_req: Request, res: Response): Promise<void> => {
  const sales = await saleService.getAll();
  res.json(sales);
};
