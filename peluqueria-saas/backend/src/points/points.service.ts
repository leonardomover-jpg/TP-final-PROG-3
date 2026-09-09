import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AwardPointsDto } from './dto/award-points.dto';
import { RedeemPointsDto } from './dto/redeem-points.dto';

/**
 * Puntos de fidelización (Etapa 13, doc `17-FIDELIZACION.md` §1). Sin
 * otorgamiento automático por venta en esta etapa — solo estos dos
 * endpoints explícitos, decisión documentada en §6 del mismo doc.
 * `Client.loyaltyPoints` es el saldo cacheado; `LoyaltyPointsTransaction`
 * es el ledger inmutable que lo explica (mismo patrón que el arqueo de caja
 * de la Etapa 12: nunca se pisa un valor, se registra el movimiento).
 */
@Injectable()
export class PointsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async assertClientExists(clientId: string) {
    const client = await this.tenantPrisma.client.client.findUnique({ where: { id: clientId } });
    if (!client || client.deletedAt) {
      throw new NotFoundException('Cliente no encontrado.');
    }
    return client;
  }

  async getBalance(clientId: string) {
    const client = await this.assertClientExists(clientId);
    return { clientId: client.id, balance: client.loyaltyPoints };
  }

  async getTransactions(clientId?: string) {
    if (clientId) {
      await this.assertClientExists(clientId);
    }
    return this.tenantPrisma.client.loyaltyPointsTransaction.findMany({
      where: { ...(clientId && { clientId }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async award(dto: AwardPointsDto) {
    await this.assertClientExists(dto.clientId);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: dto.clientId },
        data: { loyaltyPoints: { increment: dto.amount } },
      });
      return tx.loyaltyPointsTransaction.create({
        data: {
          tenantId: this.tenantPrisma.tenantId,
          clientId: dto.clientId,
          delta: dto.amount,
          reason: dto.reason,
        },
      });
    });
  }

  async redeem(dto: RedeemPointsDto) {
    const client = await this.assertClientExists(dto.clientId);
    if (client.loyaltyPoints < dto.amount) {
      throw new BadRequestException(
        `Saldo insuficiente: el cliente tiene ${client.loyaltyPoints} puntos y se intentaron canjear ${dto.amount}.`,
      );
    }
    return this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: dto.clientId },
        data: { loyaltyPoints: { decrement: dto.amount } },
      });
      return tx.loyaltyPointsTransaction.create({
        data: {
          tenantId: this.tenantPrisma.tenantId,
          clientId: dto.clientId,
          delta: -dto.amount,
          reason: dto.reason,
        },
      });
    });
  }
}
