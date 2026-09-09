import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ConnectMercadoPagoDto } from './dto/connect-mercado-pago.dto';
import { ConnectWhatsAppDto } from './dto/connect-whatsapp.dto';
import { ConnectMetaMessagingDto } from './dto/connect-meta-messaging.dto';
import { validateAccessToken as validateMercadoPagoAccessToken } from '../mercado-pago/mercado-pago-client';
import { validateCredentials as validateWhatsAppCredentials } from '../whatsapp/whatsapp-client';
import { validateAccessToken as validateMetaAccessToken } from '../meta/meta-client';
import { encryptTenantSecret } from '../common/crypto/tenant-secret-cipher';

const MERCADO_PAGO_PROVIDER = 'mercado_pago';
const WHATSAPP_PROVIDER = 'whatsapp';
const FACEBOOK_PROVIDER = 'facebook';
const INSTAGRAM_PROVIDER = 'instagram';

const SAFE_SELECT = {
  id: true,
  provider: true,
  status: true,
  publicKey: true,
  phoneNumberId: true,
  externalAccountId: true,
  connectedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Integraciones POR NEGOCIO (Etapa 15, doc `19-MERCADO-PAGO-CLIENTES.md`).
 * Cada tenant conecta su PROPIA cuenta de Mercado Pago acá — nunca se
 * devuelven los campos cifrados en ninguna respuesta (`SAFE_SELECT` los
 * excluye siempre); `DepositsService`/el webhook por tenant son los
 * únicos que los descifran, y solo en memoria, justo antes de llamar a la
 * API de Mercado Pago.
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.tenantIntegration.findMany({ select: SAFE_SELECT });
  }

  async connectMercadoPago(dto: ConnectMercadoPagoDto) {
    const baseUrl = process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com';
    // Nunca se guarda un token sin antes confirmar que funciona de verdad
    // contra la API real (doc 05 punto 94: no asumir, verificar).
    const valid = await validateMercadoPagoAccessToken(baseUrl, dto.accessToken);
    if (!valid) {
      throw new BadRequestException('El access token de Mercado Pago no es válido — revisalo e intentá de nuevo.');
    }

    return this.tenantPrisma.client.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId: this.tenantPrisma.tenantId, provider: MERCADO_PAGO_PROVIDER } },
      create: {
        tenantId: this.tenantPrisma.tenantId,
        provider: MERCADO_PAGO_PROVIDER,
        status: 'connected',
        publicKey: dto.publicKey,
        encryptedAccessToken: encryptTenantSecret(dto.accessToken),
        encryptedWebhookSecret: encryptTenantSecret(dto.webhookSecret),
        connectedAt: new Date(),
      },
      update: {
        status: 'connected',
        publicKey: dto.publicKey,
        encryptedAccessToken: encryptTenantSecret(dto.accessToken),
        encryptedWebhookSecret: encryptTenantSecret(dto.webhookSecret),
        connectedAt: new Date(),
      },
      select: SAFE_SELECT,
    });
  }

  async disconnectMercadoPago() {
    const existing = await this.tenantPrisma.client.tenantIntegration.findFirst({
      where: { provider: MERCADO_PAGO_PROVIDER },
    });
    if (!existing) {
      throw new NotFoundException('Este negocio no tiene Mercado Pago conectado.');
    }
    // Se limpian las credenciales al desconectar (no queda un secreto
    // "inerte" en la base) — `connectedAt` se conserva como historial de
    // cuándo estuvo conectado por última vez.
    return this.tenantPrisma.client.tenantIntegration.update({
      where: { id: existing.id },
      data: { status: 'disconnected', encryptedAccessToken: null, encryptedWebhookSecret: null },
      select: SAFE_SELECT,
    });
  }

  async connectWhatsApp(dto: ConnectWhatsAppDto) {
    const baseUrl = process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com/v21.0';
    const valid = await validateWhatsAppCredentials(baseUrl, dto.phoneNumberId, dto.accessToken);
    if (!valid) {
      throw new BadRequestException(
        'El access token o el phoneNumberId de WhatsApp no son válidos — revisalos e intentá de nuevo.',
      );
    }

    return this.tenantPrisma.client.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId: this.tenantPrisma.tenantId, provider: WHATSAPP_PROVIDER } },
      create: {
        tenantId: this.tenantPrisma.tenantId,
        provider: WHATSAPP_PROVIDER,
        status: 'connected',
        phoneNumberId: dto.phoneNumberId,
        encryptedAccessToken: encryptTenantSecret(dto.accessToken),
        encryptedWebhookSecret: encryptTenantSecret(dto.appSecret),
        encryptedVerifyToken: encryptTenantSecret(dto.verifyToken),
        connectedAt: new Date(),
      },
      update: {
        status: 'connected',
        phoneNumberId: dto.phoneNumberId,
        encryptedAccessToken: encryptTenantSecret(dto.accessToken),
        encryptedWebhookSecret: encryptTenantSecret(dto.appSecret),
        encryptedVerifyToken: encryptTenantSecret(dto.verifyToken),
        connectedAt: new Date(),
      },
      select: SAFE_SELECT,
    });
  }

  async disconnectWhatsApp() {
    const existing = await this.tenantPrisma.client.tenantIntegration.findFirst({
      where: { provider: WHATSAPP_PROVIDER },
    });
    if (!existing) {
      throw new NotFoundException('Este negocio no tiene WhatsApp conectado.');
    }
    return this.tenantPrisma.client.tenantIntegration.update({
      where: { id: existing.id },
      data: {
        status: 'disconnected',
        encryptedAccessToken: null,
        encryptedWebhookSecret: null,
        encryptedVerifyToken: null,
      },
      select: SAFE_SELECT,
    });
  }

  // Facebook (Messenger) e Instagram (Messaging) comparten exactamente la
  // misma forma de credenciales y de mecanismo de webhook (Etapa 17, doc
  // `21-INSTAGRAM-FACEBOOK.md`) — un solo par de helpers genéricos en vez
  // de repetir 4 veces el mismo connect/disconnect.
  private async connectMetaMessaging(provider: string, dto: ConnectMetaMessagingDto, invalidMessage: string) {
    const baseUrl = process.env.META_GRAPH_API_BASE_URL || 'https://graph.facebook.com/v21.0';
    const valid = await validateMetaAccessToken(baseUrl, dto.externalAccountId, dto.accessToken);
    if (!valid) {
      throw new BadRequestException(invalidMessage);
    }

    return this.tenantPrisma.client.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId: this.tenantPrisma.tenantId, provider } },
      create: {
        tenantId: this.tenantPrisma.tenantId,
        provider,
        status: 'connected',
        externalAccountId: dto.externalAccountId,
        encryptedAccessToken: encryptTenantSecret(dto.accessToken),
        encryptedWebhookSecret: encryptTenantSecret(dto.appSecret),
        encryptedVerifyToken: encryptTenantSecret(dto.verifyToken),
        connectedAt: new Date(),
      },
      update: {
        status: 'connected',
        externalAccountId: dto.externalAccountId,
        encryptedAccessToken: encryptTenantSecret(dto.accessToken),
        encryptedWebhookSecret: encryptTenantSecret(dto.appSecret),
        encryptedVerifyToken: encryptTenantSecret(dto.verifyToken),
        connectedAt: new Date(),
      },
      select: SAFE_SELECT,
    });
  }

  private async disconnectMetaMessaging(provider: string, notConnectedMessage: string) {
    const existing = await this.tenantPrisma.client.tenantIntegration.findFirst({ where: { provider } });
    if (!existing) {
      throw new NotFoundException(notConnectedMessage);
    }
    return this.tenantPrisma.client.tenantIntegration.update({
      where: { id: existing.id },
      data: {
        status: 'disconnected',
        encryptedAccessToken: null,
        encryptedWebhookSecret: null,
        encryptedVerifyToken: null,
      },
      select: SAFE_SELECT,
    });
  }

  connectFacebook(dto: ConnectMetaMessagingDto) {
    return this.connectMetaMessaging(
      FACEBOOK_PROVIDER,
      dto,
      'El access token o el Page ID de Facebook no son válidos — revisalos e intentá de nuevo.',
    );
  }

  disconnectFacebook() {
    return this.disconnectMetaMessaging(FACEBOOK_PROVIDER, 'Este negocio no tiene Facebook conectado.');
  }

  connectInstagram(dto: ConnectMetaMessagingDto) {
    return this.connectMetaMessaging(
      INSTAGRAM_PROVIDER,
      dto,
      'El access token o el ID de la cuenta de Instagram no son válidos — revisalos e intentá de nuevo.',
    );
  }

  disconnectInstagram() {
    return this.disconnectMetaMessaging(INSTAGRAM_PROVIDER, 'Este negocio no tiene Instagram conectado.');
  }
}
