import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

/**
 * Promociones (Etapa 13, doc `17-FIDELIZACION.md` §4). CRUD puro: crear una
 * Promotion NO descuenta nada de ninguna Sale — SalesService (Etapa 12) no
 * se toca en esta etapa, ver §6. Sirve hoy como catálogo consultable (ej.
 * para mostrarlo en la página pública o que el mostrador aplique el
 * descuento a mano); la aplicación automática queda para una etapa futura.
 */
@Injectable()
export class PromotionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.promotion.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const promotion = await this.tenantPrisma.client.promotion.findUnique({ where: { id } });
    if (!promotion) {
      throw new NotFoundException('Promoción no encontrada.');
    }
    return promotion;
  }

  async create(dto: CreatePromotionDto) {
    try {
      return await this.tenantPrisma.client.promotion.create({
        data: {
          tenantId: this.tenantPrisma.tenantId,
          name: dto.name,
          code: dto.code,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una promoción con ese código en este negocio.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePromotionDto) {
    await this.findOne(id);
    const data: Prisma.PromotionUpdateInput = {
      ...(dto.name && { name: dto.name }),
      ...(dto.code !== undefined && { code: dto.code }),
      ...(dto.discountType && { discountType: dto.discountType }),
      ...(dto.discountValue !== undefined && { discountValue: dto.discountValue }),
      ...(dto.startsAt !== undefined && { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }),
      ...(dto.endsAt !== undefined && { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }),
      ...(dto.status && { status: dto.status }),
    };
    try {
      return await this.tenantPrisma.client.promotion.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una promoción con ese código en este negocio.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.tenantPrisma.client.promotion.update({ where: { id }, data: { status: 'inactive' } });
  }
}
