import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto';
import { CloseCashRegisterDto } from './dto/close-cash-register.dto';
import { ListCashRegistersQueryDto } from './dto/list-cash-registers.query.dto';

/**
 * Apertura/cierre de caja con arqueo (punto de la Etapa 12 del roadmap).
 * Un único registro `open` por sucursal a la vez — abrir una segunda vez
 * sin cerrar la anterior es un error del operador, no un caso a soportar
 * silenciosamente (mezclaría el efectivo de dos turnos).
 */
@Injectable()
export class CashRegisterService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll(query: ListCashRegistersQueryDto) {
    return this.tenantPrisma.client.cashRegister.findMany({
      where: {
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.status && { status: query.status }),
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const cashRegister = await this.tenantPrisma.client.cashRegister.findUnique({ where: { id } });
    if (!cashRegister) {
      throw new NotFoundException('Caja no encontrada.');
    }
    return cashRegister;
  }

  async open(dto: OpenCashRegisterDto, userId: string) {
    const branch = await this.tenantPrisma.client.branch.findUnique({ where: { id: dto.branchId } });
    if (!branch || branch.deletedAt) {
      throw new BadRequestException('La sucursal indicada no existe en este negocio.');
    }

    const alreadyOpen = await this.tenantPrisma.client.cashRegister.findFirst({
      where: { branchId: dto.branchId, status: 'open' },
    });
    if (alreadyOpen) {
      throw new BadRequestException('Ya hay una caja abierta en esta sucursal — hay que cerrarla antes de abrir otra.');
    }

    return this.tenantPrisma.client.cashRegister.create({
      data: {
        tenantId: this.tenantPrisma.tenantId,
        branchId: dto.branchId,
        openedByUserId: userId,
        openingAmount: dto.openingAmount,
        status: 'open',
      },
    });
  }

  // El arqueo: cuánto DEBERÍA haber en efectivo (lo que se declaró al
  // abrir + lo que entró en ventas en efectivo - lo que salió en gastos
  // pagados desde esta caja) contra lo que el operador contó a mano. La
  // diferencia queda registrada, nunca oculta ni "ajustada" para que cierre.
  async close(id: string, dto: CloseCashRegisterDto, userId: string) {
    const cashRegister = await this.findOne(id);
    if (cashRegister.status !== 'open') {
      throw new BadRequestException('Esta caja ya está cerrada.');
    }

    const [cashPayments, expenses] = await Promise.all([
      this.tenantPrisma.client.salePayment.aggregate({
        where: { method: 'cash', sale: { cashRegisterId: id, status: 'completed' } },
        _sum: { amount: true },
      }),
      this.tenantPrisma.client.expense.aggregate({
        where: { cashRegisterId: id },
        _sum: { amount: true },
      }),
    ]);

    const cashIn = cashPayments._sum.amount?.toNumber() ?? 0;
    const cashOut = expenses._sum.amount?.toNumber() ?? 0;
    const expectedCashAmount = cashRegister.openingAmount.toNumber() + cashIn - cashOut;
    const difference = dto.closingAmount - expectedCashAmount;

    return this.tenantPrisma.client.cashRegister.update({
      where: { id },
      data: {
        status: 'closed',
        closedByUserId: userId,
        closingAmount: dto.closingAmount,
        expectedCashAmount,
        difference,
        closedAt: new Date(),
        notes: dto.notes,
      },
    });
  }
}
