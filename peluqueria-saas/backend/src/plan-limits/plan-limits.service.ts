import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LimitableResource, PlanLimitUsage } from './plan-limits.types';

const RESOURCE_LABELS: Record<LimitableResource, string> = {
  users: 'usuarios',
  branches: 'sucursales',
  clients: 'clientes',
};

/**
 * Hace cumplir los límites del plan (doc 03 §2, doc 05 §2 del pedido: "¿qué
 * pasa cuando un negocio llega al límite?"). Centralizado acá para no
 * repetir el chequeo en cada controller de creación — mismo principio que
 * FeatureFlagsService.
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private maxFor(plan: Plan | null, resource: LimitableResource): number | null {
    if (!plan) return null;
    switch (resource) {
      case 'users':
        return plan.maxUsers;
      case 'branches':
        return plan.maxBranches;
      case 'clients':
        return plan.maxClients;
    }
  }

  private countCurrent(tenantId: string, resource: LimitableResource): Promise<number> {
    switch (resource) {
      case 'users':
        return this.prisma.user.count({ where: { tenantId, deletedAt: null } });
      case 'branches':
        return this.prisma.branch.count({ where: { tenantId, deletedAt: null } });
      case 'clients':
        return this.prisma.client.count({ where: { tenantId, deletedAt: null } });
    }
  }

  async getUsage(tenantId: string, resource: LimitableResource): Promise<PlanLimitUsage> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }
    const [current, max] = await Promise.all([
      this.countCurrent(tenantId, resource),
      Promise.resolve(this.maxFor(tenant.plan, resource)),
    ]);
    return { resource, current, max };
  }

  async getAllUsage(tenantId: string): Promise<PlanLimitUsage[]> {
    const resources: LimitableResource[] = ['users', 'branches', 'clients'];
    return Promise.all(resources.map((resource) => this.getUsage(tenantId, resource)));
  }

  // Se llama ANTES de crear una fila del recurso (usuario, sucursal). Si el
  // negocio no tiene plan asignado (max=null), no se bloquea — no hay
  // límite contra el cual comparar (doc 05 §1: onboarding sin plan
  // seleccionado todavía se resuelve en la Etapa 5, billing).
  async assertCanCreate(tenantId: string, resource: LimitableResource): Promise<void> {
    const usage = await this.getUsage(tenantId, resource);
    if (usage.max !== null && usage.current >= usage.max) {
      throw new ForbiddenException(
        `Alcanzaste el límite de ${usage.max} ${RESOURCE_LABELS[resource]} de tu plan actual. Mejorá tu plan para agregar más.`,
      );
    }
  }
}
