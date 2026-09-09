import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { IssueGiftCardDto } from './dto/issue-gift-card.dto';
import { RedeemGiftCardDto } from './dto/redeem-gift-card.dto';

const MAX_CODE_ATTEMPTS = 5;

/**
 * Gift cards (Etapa 13, doc `17-FIDELIZACION.md` §2). Igual que Puntos: sin
 * emisión ni aplicación automática desde Sale en esta etapa (§6) — se
 * emiten y canjean solo por estos endpoints explícitos. `GiftCardTransaction`
 * es el ledger inmutable de movimientos de saldo (mismo patrón que
 * LoyaltyPointsTransaction).
 */
@Injectable()
export class GiftCardsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private generateCode(): string {
    return randomBytes(5).toString('hex').toUpperCase();
  }

  findAll() {
    return this.tenantPrisma.client.giftCard.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const giftCard = await this.tenantPrisma.client.giftCard.findUnique({
      where: { id },
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!giftCard) {
      throw new NotFoundException('Gift card no encontrada.');
    }
    return giftCard;
  }

  async issue(dto: IssueGiftCardDto) {
    if (dto.clientId) {
      const client = await this.tenantPrisma.client.client.findUnique({ where: { id: dto.clientId } });
      if (!client || client.deletedAt) {
        throw new NotFoundException('Cliente no encontrado.');
      }
    }

    const data = {
      tenantId: this.tenantPrisma.tenantId,
      clientId: dto.clientId,
      initialBalance: dto.initialBalance,
      balance: dto.initialBalance,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    };

    // Código provisto por el usuario: un único intento, error claro si ya existe.
    if (dto.code) {
      try {
        return await this.tenantPrisma.client.giftCard.create({ data: { ...data, code: dto.code.toUpperCase() } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Ya existe una gift card con ese código en este negocio.');
        }
        throw error;
      }
    }

    // Código autogenerado: reintenta ante una colisión improbable (espacio
    // de 5 bytes hex, no ante cualquier otro error).
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        return await this.tenantPrisma.client.giftCard.create({ data: { ...data, code: this.generateCode() } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('No se pudo generar un código de gift card único, reintentá.');
  }

  async redeem(id: string, dto: RedeemGiftCardDto) {
    const giftCard = await this.findOne(id);
    if (giftCard.status !== 'active') {
      throw new BadRequestException(`La gift card está "${giftCard.status}", no se puede canjear.`);
    }
    if (giftCard.expiresAt && giftCard.expiresAt < new Date()) {
      throw new BadRequestException('La gift card está vencida.');
    }
    const balance = Number(giftCard.balance);
    if (balance < dto.amount) {
      throw new BadRequestException(`Saldo insuficiente: la gift card tiene ${balance} y se intentaron canjear ${dto.amount}.`);
    }

    const newBalance = balance - dto.amount;
    return this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.giftCard.update({
        where: { id },
        data: { balance: newBalance, ...(newBalance === 0 && { status: 'redeemed' }) },
      });
      return tx.giftCardTransaction.create({
        data: { giftCardId: id, amount: -dto.amount, reason: dto.reason },
      });
    });
  }

  async cancel(id: string) {
    const giftCard = await this.findOne(id);
    if (giftCard.status !== 'active') {
      throw new BadRequestException(`La gift card ya está "${giftCard.status}".`);
    }
    return this.tenantPrisma.client.giftCard.update({ where: { id }, data: { status: 'cancelled' } });
  }
}
