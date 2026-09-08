import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagResolution } from './feature-flags.types';

/**
 * Único lugar del backend que resuelve la jerarquía SUPER ADMIN → Plan →
 * Negocio (doc 03 §3). Nadie más — ni un controller, ni otro service —
 * vuelve a escribir esa lógica; todos llaman acá (principio del punto 95
 * del pedido: centralizar, nada de `if plan === 'premium'` repetido).
 *
 * Reglas (idénticas a las del doc 03, sección 3):
 *   flag.globallyEnabled = false          → NO disponible, sin excepción
 *   globalmente habilitado + fuera del plan → NO disponible para ese negocio
 *   globalmente habilitado + en el plan     → el negocio puede prender/apagar
 */
@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveOne(
    tenant: { id: string; planId: string | null },
    flag: { id: string; key: string; name: string; description: string; globallyEnabled: boolean },
    planFeatureKeys: Set<string> | null,
    tenantFlags: Map<string, boolean>,
  ): Promise<FeatureFlagResolution> {
    if (!flag.globallyEnabled) {
      return {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        available: false,
        enabled: false,
        reason: 'Este módulo fue deshabilitado por la plataforma.',
      };
    }

    if (!tenant.planId) {
      return {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        available: false,
        enabled: false,
        reason: 'Tu negocio todavía no tiene un plan asignado.',
      };
    }

    if (!planFeatureKeys || !planFeatureKeys.has(flag.key)) {
      return {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        available: false,
        enabled: false,
        reason: 'Este módulo no está incluido en tu plan actual.',
      };
    }

    return {
      key: flag.key,
      name: flag.name,
      description: flag.description,
      available: true,
      enabled: tenantFlags.get(flag.key) ?? false,
    };
  }

  private async loadContext(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }

    const [allFlags, planFeatures, tenantFeatureFlags] = await Promise.all([
      this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }),
      tenant.planId
        ? this.prisma.planFeature.findMany({
            where: { planId: tenant.planId },
            include: { featureFlag: true },
          })
        : Promise.resolve([]),
      this.prisma.tenantFeatureFlag.findMany({ where: { tenantId } }),
    ]);

    const planFeatureKeys = tenant.planId
      ? new Set(planFeatures.map((pf) => pf.featureFlag.key))
      : null;
    const tenantFlags = new Map(tenantFeatureFlags.map((tf) => [tf.featureFlagId, tf.enabled]));
    // El mapa anterior está indexado por featureFlagId; se necesita por key
    // para cruzarlo con el catálogo — se arma acá para no repetir el join.
    const tenantFlagsByKey = new Map<string, boolean>();
    for (const flag of allFlags) {
      if (tenantFlags.has(flag.id)) {
        tenantFlagsByKey.set(flag.key, tenantFlags.get(flag.id) as boolean);
      }
    }

    return { tenant, allFlags, planFeatureKeys, tenantFlagsByKey };
  }

  async resolveAllForTenant(tenantId: string): Promise<FeatureFlagResolution[]> {
    const { tenant, allFlags, planFeatureKeys, tenantFlagsByKey } = await this.loadContext(tenantId);
    return Promise.all(
      allFlags.map((flag) => this.resolveOne(tenant, flag, planFeatureKeys, tenantFlagsByKey)),
    );
  }

  async resolveOneForTenant(tenantId: string, key: string): Promise<FeatureFlagResolution> {
    const { tenant, allFlags, planFeatureKeys, tenantFlagsByKey } = await this.loadContext(tenantId);
    const flag = allFlags.find((f) => f.key === key);
    if (!flag) {
      throw new NotFoundException(`No existe el módulo "${key}".`);
    }
    return this.resolveOne(tenant, flag, planFeatureKeys, tenantFlagsByKey);
  }

  // Usado por FeatureFlagGuard — versión liviana que no arma la lista
  // completa del catálogo.
  async isEnabledForTenant(tenantId: string, key: string): Promise<boolean> {
    const resolution = await this.resolveOneForTenant(tenantId, key);
    return resolution.enabled;
  }

  async setEnabledForTenant(tenantId: string, key: string, enabled: boolean): Promise<FeatureFlagResolution> {
    const current = await this.resolveOneForTenant(tenantId, key);
    if (enabled && !current.available) {
      throw new BadRequestException(current.reason ?? 'Este módulo no está disponible para tu negocio.');
    }

    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) {
      throw new NotFoundException(`No existe el módulo "${key}".`);
    }

    // Nunca se borra la fila al desactivar (doc 03 §5 / punto 11 del
    // pedido): se hace upsert de `enabled`, así el historial de "estuvo
    // activo entre estas fechas" queda disponible si en el futuro se
    // necesita, y los datos de negocio del módulo (tablas propias, cuando
    // existan) nunca se tocan desde acá.
    await this.prisma.tenantFeatureFlag.upsert({
      where: { tenantId_featureFlagId: { tenantId, featureFlagId: flag.id } },
      create: { tenantId, featureFlagId: flag.id, enabled },
      update: { enabled },
    });

    return this.resolveOneForTenant(tenantId, key);
  }
}
