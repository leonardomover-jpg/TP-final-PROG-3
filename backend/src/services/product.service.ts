import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAll = () =>
  prisma.product.findMany({ include: { category: true }, orderBy: { name: 'asc' } });

export const getById = (id: number) =>
  prisma.product.findUnique({ where: { id }, include: { category: true } });

export const create = (data: { name: string; price: number; stock: number; categoryId: number }) =>
  prisma.product.create({ data, include: { category: true } });

export const update = (id: number, data: { name?: string; price?: number; stock?: number; categoryId?: number }) =>
  prisma.product.update({ where: { id }, data, include: { category: true } });

export const remove = (id: number) => prisma.product.delete({ where: { id } });
