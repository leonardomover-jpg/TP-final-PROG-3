import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';

@Injectable()
export class PlanInfoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimitsService: PlanLimitsService,
  ) {}

  async getForTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }
    const usage = await this.planLimitsService.getAllUsage(tenantId);
    return { plan: tenant.plan, usage };
  }
}
