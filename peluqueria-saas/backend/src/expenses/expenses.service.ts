import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses.query.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll(query: ListExpensesQueryDto) {
    return this.tenantPrisma.client.expense.findMany({
      where: {
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.cashRegisterId && { cashRegisterId: query.cashRegisterId }),
        ...(query.from || query.to
          ? { date: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) } }
          : {}),
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string) {
    const expense = await this.tenantPrisma.client.expense.findUnique({ where: { id } });
    if (!expense) {
      throw new NotFoundException('Gasto no encontrado.');
    }
    return expense;
  }

  async create(dto: CreateExpenseDto) {
    if (dto.branchId) {
      const branch = await this.tenantPrisma.client.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch || branch.deletedAt) {
        throw new BadRequestException('La sucursal indicada no existe en este negocio.');
      }
    }
    if (dto.cashRegisterId) {
      const cashRegister = await this.tenantPrisma.client.cashRegister.findUnique({
        where: { id: dto.cashRegisterId },
      });
      if (!cashRegister) {
        throw new BadRequestException('La caja indicada no existe en este negocio.');
      }
      if (cashRegister.status !== 'open') {
        throw new BadRequestException('Esa caja ya está cerrada — no se le puede cargar un gasto nuevo.');
      }
    }

    return this.tenantPrisma.client.expense.create({
      data: {
        tenantId: this.tenantPrisma.tenantId,
        branchId: dto.branchId,
        cashRegisterId: dto.cashRegisterId,
        category: dto.category,
        amount: dto.amount,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }
}
