import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoCredentials } from '../mercado-pago/mercado-pago-client';
import { decryptTenantSecret } from '../common/crypto/tenant-secret-cipher';

const MERCADO_PAGO_PROVIDER = 'mercado_pago';

/**
 * Resuelve y descifra las credenciales de Mercado Pago de UN tenant
 * puntual, para los dos únicos lugares que las necesitan de verdad
 * (`DepositsService.create` y el webhook por tenant) — nunca un
 * controller. Función pura sobre `PrismaService` crudo (no
 * `TenantPrismaService`) a propósito: el webhook resuelve el tenant desde
 * la URL, no desde un JWT, así que no hay ningún request-scope del que
 * colgarse.
 */
export async function resolveMercadoPagoCredentials(
  prisma: PrismaService,
  tenantId: string,
): Promise<MercadoPagoCredentials> {
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId_provider: { tenantId, provider: MERCADO_PAGO_PROVIDER } },
  });
  if (!integration || integration.status !== 'connected' || !integration.encryptedAccessToken || !integration.encryptedWebhookSecret) {
    throw new BadRequestException('Este negocio no tiene Mercado Pago conectado.');
  }
  return {
    baseUrl: process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com',
    accessToken: decryptTenantSecret(integration.encryptedAccessToken),
    webhookSecret: decryptTenantSecret(integration.encryptedWebhookSecret),
  };
}

// Variante para el webhook: un tenantId inexistente en la URL nunca debe
// filtrar información (mismo mensaje "no conectado" que un tenant real sin
// integración) — se resuelve como NotFoundException genérico, capturado
// por el webhook controller para responder 200 igual (Mercado Pago no
// debe reintentar por un error nuestro de ruteo).
export async function resolveMercadoPagoCredentialsOrNull(
  prisma: PrismaService,
  tenantId: string,
): Promise<MercadoPagoCredentials | null> {
  try {
    return await resolveMercadoPagoCredentials(prisma, tenantId);
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      return null;
    }
    throw error;
  }
}
