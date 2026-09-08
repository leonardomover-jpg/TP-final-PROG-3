import { BadRequestException, Injectable, NotFoundException, Scope } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { MercadoPagoService } from '../mercado-pago/mercado-pago.service';
import { SelectPlanDto } from './dto/select-plan.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

const TRIAL_DAYS = 14;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
const EXPIRING_SOON_THRESHOLD_DAYS = 5;

// scope: REQUEST explícito (no confiar en la propagación automática de Nest
// acá): con tres dependencias en el constructor — TenantPrismaService
// (REQUEST) + PrismaService + MercadoPagoService (esta última de OTRO
// módulo) — la detección automática de scope de Nest no marca este service
// como request-scoped de forma consistente, y `TenantPrismaService` termina
// resolviéndose fuera de un request real (`REQUEST` llega `undefined`).
// Forzarlo acá es la manera confiable de evitarlo.
@Injectable({ scope: Scope.REQUEST })
export class SubscriptionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    // Plan/Tenant no son tenant-scoped de la misma forma que el resto (Plan
    // es catálogo de plataforma; Tenant es la fila raíz, no tiene tenantId
    // propio) — PrismaService crudo es correcto acá, igual que en
    // RolesService al leer el catálogo de Permission.
    private readonly prisma: PrismaService,
    private readonly mercadoPago: MercadoPagoService,
  ) {}

  // Elegir (o cambiar) de plan arranca/reapunta la suscripción. La primera
  // vez que un negocio elige un plan entra en trial (punto 13 del pedido).
  // Tenant.planId se actualiza en la MISMA transacción: es el campo que
  // consultan FeatureFlagsService/PlanLimitsService (Etapa 4), así que
  // nunca puede quedar desincronizado del plan de la Subscription.
  async selectPlan(dto: SelectPlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || plan.status !== 'active') {
      throw new BadRequestException('El plan indicado no existe o no está disponible.');
    }

    const tenantId = this.tenantPrisma.tenantId; // del JWT verificado, no del body
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_MS);

    const [subscription] = await this.prisma.$transaction([
      this.prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          planId: dto.planId,
          status: 'trial',
          trialEndsAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
        },
        update: { planId: dto.planId },
      }),
      this.prisma.tenant.update({ where: { id: tenantId }, data: { planId: dto.planId } }),
    ]);

    return subscription;
  }

  // Genera un checkout de Mercado Pago para pagar el plan ya elegido.
  // external_reference = subscription.id: el webhook usa ese mismo id para
  // encontrar a qué negocio corresponde el pago, sin tener que confiar en
  // ningún otro dato que venga del lado del comprador.
  async createCheckout(dto: CreateCheckoutDto) {
    const tenantId = this.tenantPrisma.tenantId;
    const subscription = await this.tenantPrisma.client.subscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      throw new BadRequestException('Todavía no elegiste un plan — elegí uno antes de pagar.');
    }
    const [plan, tenant] = await Promise.all([
      this.prisma.plan.findUnique({ where: { id: subscription.planId } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
    ]);
    if (!plan || !tenant) {
      throw new NotFoundException('No se pudo resolver el plan o el negocio.');
    }

    const preference = await this.mercadoPago.createPreference({
      title: `Suscripción ${plan.name} — ${tenant.name}`,
      quantity: 1,
      unitPrice: plan.price.toNumber(),
      externalReference: subscription.id,
      backUrls: {
        success: dto.successUrl,
        failure: dto.failureUrl,
        pending: dto.pendingUrl,
      },
    });

    return {
      checkoutUrl: preference.initPoint,
      sandboxCheckoutUrl: preference.sandboxInitPoint,
      preferenceId: preference.id,
    };
  }

  async getForTenant() {
    const tenantId = this.tenantPrisma.tenantId;
    const subscription = await this.tenantPrisma.client.subscription.findUnique({
      where: { tenantId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!subscription) {
      return { subscription: null };
    }

    // Fecha del SERVIDOR, nunca la que mande el cliente (punto 13 del pedido).
    const now = new Date();
    const msRemaining = subscription.currentPeriodEnd.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    const expired = msRemaining < 0;
    const expiringSoon =
      !expired &&
      ['trial', 'active'].includes(subscription.status) &&
      daysRemaining <= EXPIRING_SOON_THRESHOLD_DAYS;

    return { subscription: { ...subscription, daysRemaining, expiringSoon, expired } };
  }
}
