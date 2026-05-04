import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAll = () => prisma.category.findMany({ orderBy: { name: 'asc' } });

export const create = (name: string) => prisma.category.create({ data: { name } });
