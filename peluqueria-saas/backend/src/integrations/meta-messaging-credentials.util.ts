import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaMessagingCredentials } from '../meta/meta-client';
import { decryptTenantSecret } from '../common/crypto/tenant-secret-cipher';

/**
 * Resuelve y descifra las credenciales de Facebook/Instagram de UN tenant
 * puntual — mismo criterio que `whatsapp-credentials.util.ts` (Etapa 16):
 * función pura sobre `PrismaService` crudo, usada por el módulo de
 * respuesta manual y por los webhooks por tenant.
 */
export async function resolveMetaMessagingCredentials(
  prisma: PrismaService,
  tenantId: string,
  provider: 'facebook' | 'instagram',
): Promise<MetaMessagingCredentials> {
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
  });
  if (
    !integration ||
    integration.status !== 'connected' ||
    !integration.externalAccountId ||
    !integration.encryptedAccessToken ||
    !integration.encryptedWebhookSecret ||
    !integration.encryptedVerifyToken
  ) {
    const label = provider === 'facebook' ? 'Facebook' : 'Instagram';
    throw new BadRequestException(`Este negocio no tiene ${label} conectado.`);
  }
  return {
    baseUrl: process.env.META_GRAPH_API_BASE_URL || 'https://graph.facebook.com/v21.0',
    accessToken: decryptTenantSecret(integration.encryptedAccessToken),
    externalAccountId: integration.externalAccountId,
    appSecret: decryptTenantSecret(integration.encryptedWebhookSecret),
    verifyToken: decryptTenantSecret(integration.encryptedVerifyToken),
  };
}

export async function resolveMetaMessagingCredentialsOrNull(
  prisma: PrismaService,
  tenantId: string,
  provider: 'facebook' | 'instagram',
): Promise<MetaMessagingCredentials | null> {
  try {
    return await resolveMetaMessagingCredentials(prisma, tenantId, provider);
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      return null;
    }
    throw error;
  }
}
