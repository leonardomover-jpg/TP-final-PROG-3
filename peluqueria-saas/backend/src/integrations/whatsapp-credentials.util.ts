import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCredentials } from '../whatsapp/whatsapp-client';
import { decryptTenantSecret } from '../common/crypto/tenant-secret-cipher';

const WHATSAPP_PROVIDER = 'whatsapp';

/**
 * Resuelve y descifra las credenciales de WhatsApp de UN tenant puntual —
 * mismo criterio que `mercado-pago-credentials.util.ts` (Etapa 15):
 * función pura sobre `PrismaService` crudo, usada por `WhatsAppService`
 * (envío) y por el webhook por tenant (recepción + verificación de firma).
 */
export async function resolveWhatsAppCredentials(prisma: PrismaService, tenantId: string): Promise<WhatsAppCredentials> {
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId_provider: { tenantId, provider: WHATSAPP_PROVIDER } },
  });
  if (
    !integration ||
    integration.status !== 'connected' ||
    !integration.phoneNumberId ||
    !integration.encryptedAccessToken ||
    !integration.encryptedWebhookSecret ||
    !integration.encryptedVerifyToken
  ) {
    throw new BadRequestException('Este negocio no tiene WhatsApp conectado.');
  }
  return {
    baseUrl: process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com/v21.0',
    accessToken: decryptTenantSecret(integration.encryptedAccessToken),
    phoneNumberId: integration.phoneNumberId,
    appSecret: decryptTenantSecret(integration.encryptedWebhookSecret),
    verifyToken: decryptTenantSecret(integration.encryptedVerifyToken),
  };
}

export async function resolveWhatsAppCredentialsOrNull(
  prisma: PrismaService,
  tenantId: string,
): Promise<WhatsAppCredentials | null> {
  try {
    return await resolveWhatsAppCredentials(prisma, tenantId);
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      return null;
    }
    throw error;
  }
}
