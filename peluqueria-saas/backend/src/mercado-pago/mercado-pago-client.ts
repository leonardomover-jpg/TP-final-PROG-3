import { InternalServerErrorException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { CreatePreferenceInput, CreatePreferenceResult, MercadoPagoPayment, WebhookSignatureInput } from './mercado-pago.types';

export interface MercadoPagoCredentials {
  baseUrl: string;
  accessToken: string;
  webhookSecret: string;
}

/**
 * Funciones puras de comunicación con la API de Mercado Pago (Checkout Pro
 * + verificación de firma de webhooks), parametrizadas por credenciales —
 * extraídas de `MercadoPagoService` en la Etapa 15 para poder reusarlas
 * con DOS orígenes de credenciales distintos:
 *   - la cuenta de LA PLATAFORMA (variables de entorno, `MercadoPagoService`,
 *     billing SaaS, Etapa 5), y
 *   - la cuenta PROPIA de cada negocio (`TenantIntegration` cifrada en la
 *     base, `IntegrationsService`/`DepositsService`, Etapa 15).
 * `MercadoPagoService` sigue siendo el único punto de entrada para el
 * flujo de plataforma (mismo comportamiento externo, sin cambios) — este
 * módulo es la implementación interna compartida, nunca se llama
 * directamente desde un controller.
 */
export async function createPreference(
  credentials: MercadoPagoCredentials,
  input: CreatePreferenceInput,
  notificationUrl?: string,
): Promise<CreatePreferenceResult> {
  const response = await fetch(`${credentials.baseUrl}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          title: input.title,
          quantity: input.quantity,
          unit_price: input.unitPrice,
          currency_id: 'ARS',
        },
      ],
      external_reference: input.externalReference,
      notification_url: notificationUrl,
      back_urls: input.backUrls,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new InternalServerErrorException(`Mercado Pago rechazó la creación de la preferencia de pago: ${body}`);
  }

  const data = await response.json();
  return {
    id: String(data.id),
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point,
  };
}

export async function getPayment(credentials: MercadoPagoCredentials, paymentId: string): Promise<MercadoPagoPayment> {
  const response = await fetch(`${credentials.baseUrl}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new InternalServerErrorException(`No se pudo consultar el pago en Mercado Pago: ${body}`);
  }

  const data = await response.json();
  return {
    id: String(data.id),
    status: data.status,
    externalReference: data.external_reference ?? null,
    transactionAmount: data.transaction_amount,
    raw: data,
  };
}

// GET /users/me — la forma más simple de confirmar que un access_token es
// válido de verdad antes de guardarlo (nunca confiar en que el string que
// pegó el usuario funciona, doc 05 punto 94: no asumir sin verificar).
export async function validateAccessToken(baseUrl: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`${baseUrl}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.ok;
}

export function verifyWebhookSignature(credentials: Pick<MercadoPagoCredentials, 'webhookSecret'>, input: WebhookSignatureInput): boolean {
  const parts = new Map(
    input.xSignature.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()];
    }),
  );
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1) {
    return false;
  }

  let manifest = '';
  if (input.dataId) {
    manifest += `id:${input.dataId.toLowerCase()};`;
  }
  if (input.xRequestId) {
    manifest += `request-id:${input.xRequestId};`;
  }
  manifest += `ts:${ts};`;

  const expectedHex = createHmac('sha256', credentials.webhookSecret).update(manifest).digest('hex');

  let expectedBuffer: Buffer;
  let receivedBuffer: Buffer;
  try {
    expectedBuffer = Buffer.from(expectedHex, 'hex');
    receivedBuffer = Buffer.from(v1, 'hex');
  } catch {
    return false;
  }
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
