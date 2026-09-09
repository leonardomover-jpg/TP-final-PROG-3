import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LimitableResource, PlanLimitUsage } from './plan-limits.types';

const RESOURCE_LABELS: Record<LimitableResource, string> = {
  users: 'usuarios',
  branches: 'sucursales',
  clients: 'clientes',
  professionals: 'profesionales',
};

// De mayor a menor: si el alta que se está por crear cruza el 90%, ese es
// el único aviso que importa (no también el de 75%, ya cruzado antes o en
// esta misma alta).
const WARNING_THRESHOLDS = [0.9, 0.75];

/**
 * Hace cumplir los límites del plan (doc 03 §2, doc 05 §2 del pedido: "¿qué
 * pasa cuando un negocio llega al límite?"). Centralizado acá para no
 * repetir el chequeo en cada controller de creación — mismo principio que
 * FeatureFlagsService.
 */
@Injectable()
export class PlanLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private maxFor(plan: Plan | null, resource: LimitableResource): number | null {
    if (!plan) return null;
    switch (resource) {
      case 'users':
        return plan.maxUsers;
      case 'branches':
        return plan.maxBranches;
      case 'clients':
        return plan.maxClients;
      case 'professionals':
        return plan.maxProfessionals;
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
      case 'professionals':
        return this.prisma.professional.count({ where: { tenantId, deletedAt: null } });
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
    const resources: LimitableResource[] = ['users', 'branches', 'clients', 'professionals'];
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
    if (usage.max !== null) {
      await this.notifyIfCrossingThreshold(tenantId, resource, usage.current, usage.max);
    }
  }

  // Se llama solo del lado que SÍ va a crear la fila (assertCanCreate ya
  // no lanzó) — compara el % de uso ANTES vs. DESPUÉS de esta alta
  // (usage.current es el conteo previo a crearla) para avisar una única
  // vez por cruce, sin necesidad de guardar "ya avisé este umbral" en
  // ningún lado (doc `05-OBSERVACIONES-Y-RIESGOS.md` §8, doc
  // `18-NOTIFICACIONES.md` §3).
  private async notifyIfCrossingThreshold(
    tenantId: string,
    resource: LimitableResource,
    currentBeforeCreate: number,
    max: number,
  ): Promise<void> {
    const before = currentBeforeCreate / max;
    const after = (currentBeforeCreate + 1) / max;
    const crossed = WARNING_THRESHOLDS.find((threshold) => after >= threshold && before < threshold);
    if (!crossed) {
      return;
    }
    const percent = Math.round(crossed * 100);
    await this.notificationsService.notifyUsersWithPermission(
      tenantId,
      'suscripcion.gestionar',
      'plan_limit_warning',
      `Cerca del límite de ${RESOURCE_LABELS[resource]} del plan`,
      `Vas a usar ${currentBeforeCreate + 1} de ${max} ${RESOURCE_LABELS[resource]} incluidos en tu plan (${percent}%). Considerá mejorar tu plan antes de llegar al límite.`,
      { resource, threshold: crossed },
    );
  }
}
