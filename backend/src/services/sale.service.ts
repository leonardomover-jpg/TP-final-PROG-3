// ============================================================
//  SERVICIO DE VENTAS (sale.service.ts)
//  Maneja la creación de ventas y la consulta del historial.
//  La creación usa una TRANSACCIÓN para garantizar que todos los
//  pasos se completen juntos o ninguno se guarde (atomicidad).
// ============================================================

import { PrismaClient } from '@prisma/client';
import { getIO } from '../websocket/socket';

const prisma = new PrismaClient();

// Tipo que describe cada ítem del carrito enviado desde el frontend
interface SaleItem {
  productId: number; // ID del producto a vender
  quantity:  number; // Cantidad a vender
}

/**
 * createSale — Registra una nueva venta con todos sus ítems.
 *
 * @param userId - ID del usuario autenticado que realiza la venta
 * @param items  - Array de ítems: [{ productId, quantity }, ...]
 * @returns      La venta creada con todos sus detalles y datos del usuario
 * @throws       Error si un producto no existe o no tiene stock suficiente
 *
 * ¿Por qué usar una TRANSACCIÓN ($transaction)?
 * Si la venta tiene 3 productos y el 3ro no tiene stock, la transacción
 * revierte automáticamente los cambios de los 2 primeros. Sin transacción,
 * quedaría el stock descontado parcialmente y sin la venta registrada.
 *
 * Proceso dentro de la transacción:
 *  1. Para cada ítem: valida existencia y stock del producto
 *  2. Calcula el precio total (price × quantity por cada ítem)
 *  3. Descuenta el stock de cada producto
 *  4. Crea el registro de Venta (Sale) con sus detalles (SaleDetail)
 *  5. Emite el stock actualizado a todos los clientes vía WebSocket
 */
export const createSale = async (userId: number, items: SaleItem[]) => {
  return prisma.$transaction(async (tx) => {
    let total = 0;
    const details: { productId: number; quantity: number; unitPrice: number }[] = [];

    // ── Paso 1 & 2: Validar stock y calcular total ────────────
    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });

      if (!product)
        throw new Error(`Producto ${item.productId} no encontrado`);

      if (product.stock < item.quantity)
        throw new Error(`Stock insuficiente para "${product.name}" (disponible: ${product.stock})`);

      // Acumulamos el total y preparamos el detalle con el precio actual
      // Guardamos unitPrice para mantener el precio histórico (aunque el precio cambie después)
      total += product.price * item.quantity;
      details.push({ productId: item.productId, quantity: item.quantity, unitPrice: product.price });

      // ── Paso 3: Descontar stock ───────────────────────────────
      // `decrement` resta la cantidad al stock actual de forma segura
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    // ── Paso 4: Crear la venta con todos sus detalles ─────────
    // `details: { create: details }` inserta todos los SaleDetail en la misma operación
    const sale = await tx.sale.create({
      data: { total, userId, details: { create: details } },
      include: {
        details: { include: { product: true } }, // Incluye datos del producto en cada detalle
        user: { select: { email: true } },        // Solo trae el email del usuario (no la contraseña)
      },
    });

    // ── Paso 5: Emitir stock actualizado por WebSocket ────────
    // Avisa a todos los clientes conectados que el stock cambió
    // El frontend escucha el evento 'stock-update' y actualiza la tabla en tiempo real
    const updatedProducts = await tx.product.findMany({ include: { category: true }, orderBy: { name: 'asc' } });
    getIO().emit('stock-update', updatedProducts);

    return sale;
  });
};

/**
 * getAll — Devuelve el historial completo de ventas, de la más reciente a la más antigua.
 * Incluye: email del vendedor y detalle de cada producto vendido.
 * @returns Lista de ventas con sus detalles e información de usuario
 */
export const getAll = () =>
  prisma.sale.findMany({
    include: {
      user: { select: { email: true } },          // Email del vendedor
      details: { include: { product: true } },    // Productos de cada venta
    },
    orderBy: { createdAt: 'desc' }, // Las más recientes primero
  });
