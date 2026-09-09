import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateReferralDto } from './dto/create-referral.dto';

/**
 * Referidos entre clientes (Etapa 13, doc `17-FIDELIZACION.md` §3). Un
 * referido nace "pending"; al completarse manualmente (POST /:id/complete —
 * decisión de negocio explícita, ej. "el referido ya vino e hizo su primer
 * turno/venta", nunca automático desde Sale ni Appointment, ver §6) se
 * acreditan los puntos de recompensa al referente reusando el mismo ledger
 * de LoyaltyPointsTransaction que usa el módulo Points.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async assertClientExists(clientId: string) {
    const client = await this.tenantPrisma.client.client.findUnique({ where: { id: clientId } });
    if (!client || client.deletedAt) {
      throw new NotFoundException('Cliente no encontrado.');
    }
    return client;
  }

  findAll() {
    return this.tenantPrisma.client.referral.findMany({
      include: {
        referrerClient: { select: { id: true, firstName: true, lastName: true } },
        referredClient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const referral = await this.tenantPrisma.client.referral.findUnique({
      where: { id },
      include: {
        referrerClient: { select: { id: true, firstName: true, lastName: true } },
        referredClient: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!referral) {
      throw new NotFoundException('Referido no encontrado.');
    }
    return referral;
  }

  async create(dto: CreateReferralDto) {
    if (dto.referrerClientId === dto.referredClientId) {
      throw new BadRequestException('El cliente referente y el referido no pueden ser el mismo.');
    }
    await Promise.all([this.assertClientExists(dto.referrerClientId), this.assertClientExists(dto.referredClientId)]);

    try {
      return await this.tenantPrisma.client.referral.create({
        data: {
          tenantId: this.tenantPrisma.tenantId,
          referrerClientId: dto.referrerClientId,
          referredClientId: dto.referredClientId,
          rewardPoints: dto.rewardPoints,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ese cliente ya fue referido antes en este negocio.');
      }
      throw error;
    }
  }

  async complete(id: string) {
    const referral = await this.findOne(id);
    if (referral.status !== 'pending') {
      throw new BadRequestException(`El referido ya está "${referral.status}".`);
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.referral.update({ where: { id }, data: { status: 'completed' } });
      if (referral.rewardPoints) {
        await tx.client.update({
          where: { id: referral.referrerClientId },
          data: { loyaltyPoints: { increment: referral.rewardPoints } },
        });
        await tx.loyaltyPointsTransaction.create({
          data: {
            tenantId: this.tenantPrisma.tenantId,
            clientId: referral.referrerClientId,
            delta: referral.rewardPoints,
            reason: `Recompensa por referido completado (${id})`,
          },
        });
      }
      return updated;
    });
  }
}
