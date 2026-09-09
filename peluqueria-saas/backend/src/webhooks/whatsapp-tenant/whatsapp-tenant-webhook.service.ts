import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { verifyHandshake, verifyWebhookSignature } from '../../whatsapp/whatsapp-client';
import { resolveWhatsAppCredentialsOrNull } from '../../integrations/whatsapp-credentials.util';

interface IncomingWhatsAppMessage {
  from?: string;
  id?: string;
  text?: { body?: string };
}

/**
 * Webhook de WhatsApp Cloud API POR TENANT (Etapa 16, doc `20-WHATSAPP.md`)
 * — mismo criterio que el webhook de Mercado Pago por tenant (Etapa 15):
 * `PrismaService` crudo, el tenant se resuelve de la URL, no de un JWT.
 *
 * Sin motor conversacional en esta etapa (doc `20-WHATSAPP.md` §6): un
 * mensaje entrante se registra como una `Notification` para el staff con
 * permiso `turnos.ver` — el "flujo de reserva por chat" completo del
 * pedido queda para cuando exista un scheduler real ("Jobs en background",
 * doc 01) y un diseño conversacional concreto, no inventado acá.
 */
@Injectable()
export class WhatsAppTenantWebhookService {
  private readonly logger = new Logger('WhatsAppTenantWebhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // GET — handshake de suscripción que hace Meta UNA VEZ al configurar la
  // URL del webhook en el dashboard. Devuelve el hub.challenge tal cual
  // (texto plano) si el modo y el verify_token coinciden.
  async verifyHandshake(tenantId: string, mode: string | undefined, token: string | undefined, challenge: string | undefined): Promise<string> {
    if (mode !== 'subscribe') {
      throw new ForbiddenException('Solicitud de verificación inválida.');
    }
    const credentials = await resolveWhatsAppCredentialsOrNull(this.prisma, tenantId);
    if (!credentials || !verifyHandshake(credentials.verifyToken, token)) {
      throw new ForbiddenException('Token de verificación inválido.');
    }
    if (!challenge) {
      throw new BadRequestException('Falta hub.challenge.');
    }
    return challenge;
  }

  // POST — notificaciones reales (mensajes entrantes, cambios de estado de
  // mensajes salientes). La firma se verifica sobre el BODY CRUDO — nunca
  // sobre `JSON.parse(rawBody)` re-serializado, que no reproduce
  // byte-a-byte lo que Meta firmó.
  async processIncoming(tenantId: string, rawBody: Buffer, signatureHeader: string | undefined) {
    const credentials = await resolveWhatsAppCredentialsOrNull(this.prisma, tenantId);
    if (!credentials) {
      return { ignored: true, reason: 'este negocio no tiene WhatsApp conectado' };
    }

    if (!verifyWebhookSignature(credentials.appSecret, rawBody, signatureHeader)) {
      this.logger.warn(`Firma inválida en webhook de WhatsApp del tenant ${tenantId}`);
      throw new UnauthorizedException('Firma inválida.');
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { ignored: true, reason: 'body no es JSON válido' };
    }

    const messages: IncomingWhatsAppMessage[] =
      payload?.entry?.flatMap((entry: any) => entry.changes ?? []).flatMap((change: any) => change.value?.messages ?? []) ?? [];

    if (messages.length === 0) {
      // Status updates de mensajes salientes (sent/delivered/read) u otro
      // tipo de evento — reconocido, sin acción en esta etapa.
      return { ignored: true, reason: 'sin mensajes entrantes' };
    }

    for (const message of messages) {
      if (!message.from) continue;
      await this.notificationsService.notifyUsersWithPermission(
        tenantId,
        'turnos.ver',
        'whatsapp_message',
        `Nuevo WhatsApp de ${message.from}`,
        message.text?.body ?? '(mensaje sin texto — no soportado en esta etapa)',
        { from: message.from, waMessageId: message.id },
      );
    }

    return { processed: true, count: messages.length };
  }
}
