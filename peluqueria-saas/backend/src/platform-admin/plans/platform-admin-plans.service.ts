import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { SetPlanFeaturesDto } from './dto/set-plan-features.dto';

const PLAN_INCLUDE = { features: { include: { featureFlag: true } } };

@Injectable()
export class PlatformAdminPlansService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.plan.findMany({ include: PLAN_INCLUDE, orderBy: { price: 'asc' } });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id }, include: PLAN_INCLUDE });
    if (!plan) {
      throw new NotFoundException('Plan no encontrado.');
    }
    return plan;
  }

  create(dto: CreatePlanDto) {
    return this.prisma.plan.create({ data: dto, include: PLAN_INCLUDE });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findOne(id);
    return this.prisma.plan.update({ where: { id }, data: dto, include: PLAN_INCLUDE });
  }

  // No hay delete físico: negocios existentes pueden estar referenciando el
  // plan (Tenant.planId). "Archivar" (status=archived) lo saca de la oferta
  // sin romper nada de lo ya asignado — mismo patrón que Role/FeatureFlag,
  // nunca borrar lo que ya está en uso.
  archive(id: string) {
    return this.update(id, { status: 'archived' });
  }

  async setFeatures(id: string, dto: SetPlanFeaturesDto) {
    await this.findOne(id);
    const flags = await this.prisma.featureFlag.findMany({ where: { key: { in: dto.featureFlagKeys } } });
    if (flags.length !== dto.featureFlagKeys.length) {
      throw new BadRequestException('Alguno de los módulos indicados no existe.');
    }

    await this.prisma.$transaction([
      this.prisma.planFeature.deleteMany({ where: { planId: id } }),
      this.prisma.planFeature.createMany({
        data: flags.map((flag) => ({ planId: id, featureFlagId: flag.id })),
      }),
    ]);

    return this.findOne(id);
  }
}
