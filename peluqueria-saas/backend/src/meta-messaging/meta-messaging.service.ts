import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { sendFacebookMessage, sendInstagramMessage } from '../meta/meta-client';
import { resolveMetaMessagingCredentialsOrNull } from '../integrations/meta-messaging-credentials.util';

/**
 * Respuesta manual a mensajes de Facebook Messenger / Instagram Direct
 * (Etapa 17, doc `21-INSTAGRAM-FACEBOOK.md`). Sin motor conversacional —
 * el staff ve el mensaje entrante en su centro de notificaciones (Etapa
 * 14, disparado por el webhook por tenant) y responde a mano desde acá,
 * mismo criterio de restricción que WhatsApp (Etapa 16).
 */
@Injectable()
export class MetaMessagingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async reply(dto: ReplyMessageDto) {
    const enabled = await this.featureFlagsService.isEnabledForTenant(this.tenantPrisma.tenantId, dto.provider);
    if (!enabled) {
      const label = dto.provider === 'facebook' ? 'Facebook' : 'Instagram';
      throw new BadRequestException(`Este negocio no tiene el módulo de ${label} habilitado.`);
    }
    const credentials = await resolveMetaMessagingCredentialsOrNull(this.prisma, this.tenantPrisma.tenantId, dto.provider);
    if (!credentials) {
      const label = dto.provider === 'facebook' ? 'Facebook' : 'Instagram';
      throw new BadRequestException(`Este negocio no tiene ${label} conectado.`);
    }

    const send = dto.provider === 'facebook' ? sendFacebookMessage : sendInstagramMessage;
    await send(credentials, dto.recipientId, dto.message);
    return { sent: true };
  }
}
