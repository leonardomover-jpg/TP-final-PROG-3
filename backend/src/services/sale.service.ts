import { PrismaClient } from '@prisma/client';
import { getIO } from '../websocket/socket';

const prisma = new PrismaClient();

interface SaleItem {
  productId: number;
  quantity: number;
}

export const createSale = async (userId: number, items: SaleItem[]) => {
  return prisma.$transaction(async (tx) => {
    let total = 0;
    const details: { productId: number; quantity: number; unitPrice: number }[] = [];

    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new Error(`Producto ${item.productId} no encontrado`);
      if (product.stock < item.quantity)
        throw new Error(`Stock insuficiente para "${product.name}" (disponible: ${product.stock})`);

      total += product.price * item.quantity;
      details.push({ productId: item.productId, quantity: item.quantity, unitPrice: product.price });

      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    const sale = await tx.sale.create({
      data: { total, userId, details: { create: details } },
      include: { details: { include: { product: true } }, user: { select: { email: true } } },
    });

    // Emitir stock actualizado a todos los clientes conectados
    const updatedProducts = await tx.product.findMany({ include: { category: true }, orderBy: { name: 'asc' } });
    getIO().emit('stock-update', updatedProducts);

    return sale;
  });
};

export const getAll = () =>
  prisma.sale.findMany({
    include: {
      user: { select: { email: true } },
      details: { include: { product: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
