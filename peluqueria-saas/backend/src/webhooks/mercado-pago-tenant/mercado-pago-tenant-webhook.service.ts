import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { getPayment, verifyWebhookSignature } from '../../mercado-pago/mercado-pago-client';
import { resolveMercadoPagoCredentialsOrNull } from '../../integrations/mercado-pago-credentials.util';

export interface IncomingTenantWebhook {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
  type?: string;
}

/**
 * Procesa notificaciones de Mercado Pago sobre pagos de SEÑAS — la cuenta
 * de CADA NEGOCIO, nunca la de la plataforma (ver
 * `mercado-pago-webhook.service.ts`, Etapa 5, que sigue existiendo tal
 * cual para suscripciones). El `tenantId` viene de la URL
 * (`/webhooks/mercado-pago/tenant/:tenantId`, el mismo que se pasó como
 * `notification_url` al crear la preferencia) — nunca de un JWT, porque
 * un webhook no trae ninguno.
 *
 * Idempotencia: a diferencia de `SubscriptionPayment` (un ledger aparte,
 * porque una suscripción cobra todos los meses), una `Deposit` es un pago
 * único — su propio `mpPaymentId` (`@unique`) alcanza como marca de "ya
 * procesado": si ya coincide con el id del pago recibido, no se vuelve a
 * escribir nada.
 */
@Injectable()
export class MercadoPagoTenantWebhookService {
  private readonly logger = new Logger('MercadoPagoTenantWebhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async process(tenantId: string, input: IncomingTenantWebhook) {
    if (!input.xSignature || !input.dataId) {
      throw new UnauthorizedException('Notificación inválida.');
    }

    const credentials = await resolveMercadoPagoCredentialsOrNull(this.prisma, tenantId);
    if (!credentials) {
      // No es un error de Mercado Pago — se responde 200 igual para que no
      // reintente, pero no hay nada para procesar de este lado.
      return { ignored: true, reason: 'este negocio no tiene Mercado Pago conectado' };
    }

    const validSignature = verifyWebhookSignature(credentials, {
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId,
    });
    if (!validSignature) {
      this.logger.warn(`Firma inválida en webhook de tenant ${tenantId} (dataId=${input.dataId})`);
      throw new UnauthorizedException('Firma inválida.');
    }

    if (input.type && input.type !== 'payment') {
      return { ignored: true, reason: `type "${input.type}" no procesado en esta etapa` };
    }

    const payment = await getPayment(credentials, input.dataId);
    if (!payment.externalReference) {
      return { ignored: true, reason: 'pago sin external_reference' };
    }

    const deposit = await this.prisma.deposit.findUnique({ where: { id: payment.externalReference } });
    if (!deposit || deposit.tenantId !== tenantId) {
      return { ignored: true, reason: 'external_reference no corresponde a una seña de este negocio' };
    }

    if (deposit.mpPaymentId === payment.id) {
      return { alreadyProcessed: true };
    }

    const nextStatus =
      payment.status === 'approved' || payment.status === 'rejected' || payment.status === 'cancelled'
        ? payment.status
        : deposit.status;

    await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: nextStatus, mpPaymentId: payment.id },
    });

    if (payment.status === 'approved') {
      await this.notificationsService.notifyUsersWithPermission(
        tenantId,
        'senas.gestionar',
        'deposit_approved',
        'Seña confirmada',
        `Se confirmó el pago de una seña por $${payment.transactionAmount}.`,
        { depositId: deposit.id, appointmentId: deposit.appointmentId },
      );
    }

    return { processed: true };
  }
}
