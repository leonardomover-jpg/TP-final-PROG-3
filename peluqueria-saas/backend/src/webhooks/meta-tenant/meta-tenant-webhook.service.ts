import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { verifyHandshake, verifyWebhookSignature } from '../../common/crypto/meta-webhook-signature';
import { resolveMetaMessagingCredentialsOrNull } from '../../integrations/meta-messaging-credentials.util';

interface IncomingMessagingEvent {
  sender?: { id?: string };
  message?: { mid?: string; text?: string };
}

const PROVIDER_LABEL: Record<'facebook' | 'instagram', string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
};

/**
 * Webhook de Facebook Messenger / Instagram Messaging POR TENANT (Etapa
 * 17, doc `21-INSTAGRAM-FACEBOOK.md`) — mismo criterio que los webhooks
 * por tenant de Mercado Pago (Etapa 15) y WhatsApp (Etapa 16):
 * `PrismaService` crudo, el tenant se resuelve de la URL, no de un JWT.
 * Un solo service parametrizado por `provider` porque ambos comparten
 * exactamente el mismo mecanismo de handshake/firma y la misma forma de
 * payload (`entry[].messaging[]`, Messenger Platform) — fuente: doc
 * oficial de Meta for Developers (Messenger Platform webhooks), la misma
 * API que usa Instagram Messaging vía Facebook Login for Business.
 *
 * Sin motor conversacional en esta etapa (mismo criterio que WhatsApp,
 * doc `20-WHATSAPP.md` §8): un mensaje entrante se registra como una
 * `Notification` para el staff con permiso `turnos.ver` — responder es
 * manual, vía `POST /meta-messaging/reply`.
 */
@Injectable()
export class MetaTenantWebhookService {
  private readonly logger = new Logger('MetaTenantWebhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async verifyHandshake(
    provider: 'facebook' | 'instagram',
    tenantId: string,
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    if (mode !== 'subscribe') {
      throw new ForbiddenException('Solicitud de verificación inválida.');
    }
    const credentials = await resolveMetaMessagingCredentialsOrNull(this.prisma, tenantId, provider);
    if (!credentials || !verifyHandshake(credentials.verifyToken, token)) {
      throw new ForbiddenException('Token de verificación inválido.');
    }
    if (!challenge) {
      throw new BadRequestException('Falta hub.challenge.');
    }
    return challenge;
  }

  async processIncoming(provider: 'facebook' | 'instagram', tenantId: string, rawBody: Buffer, signatureHeader: string | undefined) {
    const credentials = await resolveMetaMessagingCredentialsOrNull(this.prisma, tenantId, provider);
    if (!credentials) {
      return { ignored: true, reason: `este negocio no tiene ${PROVIDER_LABEL[provider]} conectado` };
    }

    if (!verifyWebhookSignature(credentials.appSecret, rawBody, signatureHeader)) {
      this.logger.warn(`Firma inválida en webhook de ${provider} del tenant ${tenantId}`);
      throw new UnauthorizedException('Firma inválida.');
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { ignored: true, reason: 'body no es JSON válido' };
    }

    const events: IncomingMessagingEvent[] = payload?.entry?.flatMap((entry: any) => entry.messaging ?? []) ?? [];
    const withText = events.filter((event) => event.sender?.id && event.message?.text);

    if (withText.length === 0) {
      // Confirmaciones de entrega/lectura, u otro evento sin texto —
      // reconocido, sin acción en esta etapa.
      return { ignored: true, reason: 'sin mensajes de texto entrantes' };
    }

    for (const event of withText) {
      await this.notificationsService.notifyUsersWithPermission(
        tenantId,
        'turnos.ver',
        `${provider}_message`,
        `Nuevo ${PROVIDER_LABEL[provider]} de ${event.sender!.id}`,
        event.message!.text!,
        { provider, from: event.sender!.id, messageId: event.message!.mid },
      );
    }

    return { processed: true, count: withText.length };
  }
}
