import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoService } from '../../mercado-pago/mercado-pago.service';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface IncomingWebhook {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
  type?: string;
}

/**
 * Procesa notificaciones de Mercado Pago sobre pagos de SUSCRIPCIÓN (billing
 * de la plataforma). Usa PrismaService crudo a propósito — un webhook no
 * tiene un JWT de tenant detrás, así que no hay ningún `TenantPrismaService`
 * posible acá; el tenant correcto se resuelve recién después de mirar
 * `external_reference` (el id de la Subscription), nunca antes.
 *
 * Nunca se asume que un webhook llega una sola vez (punto 65 del pedido):
 * la idempotencia real la da el `@@unique([provider, providerPaymentId])`
 * de `SubscriptionPayment` — un segundo POST con el mismo pago falla el
 * insert y se trata como "ya procesado", no como error.
 */
@Injectable()
export class MercadoPagoWebhookService {
  private readonly logger = new Logger('MercadoPagoWebhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPago: MercadoPagoService,
  ) {}

  async process(input: IncomingWebhook) {
    if (!input.xSignature || !input.dataId) {
      throw new UnauthorizedException('Notificación inválida.');
    }

    const validSignature = this.mercadoPago.verifyWebhookSignature({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId,
    });
    if (!validSignature) {
      this.logger.warn(`Firma inválida en webhook (dataId=${input.dataId})`);
      throw new UnauthorizedException('Firma inválida.');
    }

    // Solo procesamos notificaciones de pago en esta etapa — cualquier otro
    // "type" (ej. merchant_order, chargebacks) se reconoce como válido pero
    // no dispara ninguna acción todavía.
    if (input.type && input.type !== 'payment') {
      return { ignored: true, reason: `type "${input.type}" no procesado en esta etapa` };
    }

    const payment = await this.mercadoPago.getPayment(input.dataId);
    if (!payment.externalReference) {
      return { ignored: true, reason: 'pago sin external_reference' };
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: payment.externalReference },
    });
    if (!subscription) {
      // No es un error: puede ser un pago de otro flujo (futura Etapa 15,
      // pagos de clientes) que comparta la misma cuenta de Mercado Pago.
      return { ignored: true, reason: 'external_reference no corresponde a una suscripción' };
    }

    try {
      await this.prisma.subscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          provider: 'mercado_pago',
          providerPaymentId: payment.id,
          amount: payment.transactionAmount,
          status: payment.status,
          rawPayload: payment.raw as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { alreadyProcessed: true };
      }
      throw error;
    }

    if (payment.status === 'approved') {
      await this.extendSubscription(subscription.id, subscription.planId, subscription.currentPeriodEnd);
      await this.prisma.auditLog.create({
        data: {
          tenantId: subscription.tenantId,
          actorType: 'webhook',
          action: 'subscription.payment_approved',
          entityType: 'Subscription',
          entityId: subscription.id,
          afterData: { paymentId: payment.id },
        },
      });
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await this.prisma.auditLog.create({
        data: {
          tenantId: subscription.tenantId,
          actorType: 'webhook',
          action: 'subscription.payment_rejected',
          entityType: 'Subscription',
          entityId: subscription.id,
          afterData: { paymentId: payment.id, status: payment.status },
        },
      });
    }

    return { processed: true };
  }

  private async extendSubscription(subscriptionId: string, planId: string, currentPeriodEnd: Date) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    const now = new Date();
    // Si todavía está dentro del período vigente, el nuevo período arranca
    // al final del actual (no se "pierde" lo ya pagado); si ya venció, arranca ahora.
    const base = currentPeriodEnd > now ? currentPeriodEnd : now;
    const periodMs = plan?.billingPeriod === 'yearly' ? YEAR_MS : THIRTY_DAYS_MS;

    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(base.getTime() + periodMs),
      },
    });
  }
}
