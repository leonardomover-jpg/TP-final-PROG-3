import { InternalServerErrorException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export interface WhatsAppCredentials {
  baseUrl: string;
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
}

/**
 * Funciones puras de comunicación con WhatsApp Cloud API (Meta Graph API) —
 * Etapa 16, doc `20-WHATSAPP.md`. Mismo molde que `mercado-pago-client.ts`
 * (Etapa 15): parametrizadas por credenciales, nunca leen variables de
 * entorno directamente, así se reusan igual para cualquier tenant.
 *
 * Fuente de la forma exacta de la API (endpoints, headers, algoritmo de
 * firma de webhooks): documentación oficial de Meta for Developers
 * (WhatsApp Cloud API / Webhooks) — punto 94 del pedido: nunca se inventó
 * un endpoint ni un formato.
 */

// POST /{phone-number-id}/messages — mensaje de texto simple. Fuera de la
// ventana de 24hs desde el último mensaje del cliente, Meta exige un
// "template" pre-aprobado en vez de texto libre; esta etapa solo cubre
// texto libre (confirmaciones/cancelaciones se disparan dentro de esa
// ventana en el uso normal) — ver doc `20-WHATSAPP.md` §6.
export async function sendTextMessage(
  credentials: WhatsAppCredentials,
  to: string,
  body: string,
): Promise<{ id: string }> {
  const response = await fetch(`${credentials.baseUrl}/${credentials.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new InternalServerErrorException(`WhatsApp Cloud API rechazó el envío del mensaje: ${errBody}`);
  }

  const data = await response.json();
  return { id: data.messages?.[0]?.id ?? '' };
}

// GET /{phone-number-id} — confirma que el access token y el
// phoneNumberId son válidos y están relacionados de verdad, antes de
// guardarlos (mismo principio ya aplicado con Mercado Pago en la Etapa 15:
// no asumir, verificar).
export async function validateCredentials(baseUrl: string, phoneNumberId: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`${baseUrl}/${phoneNumberId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.ok;
}

// Handshake de suscripción del webhook (GET, lo hace Meta una sola vez al
// configurar la URL en el dashboard): compara el hub.verify_token que
// manda Meta contra el que el negocio eligió al conectar.
export function verifyHandshake(storedVerifyToken: string, hubVerifyToken: string | undefined): boolean {
  if (!hubVerifyToken) {
    return false;
  }
  const expected = Buffer.from(storedVerifyToken);
  const received = Buffer.from(hubVerifyToken);
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}

// Firma X-Hub-Signature-256 de cada notificación entrante (formato
// "sha256=<hex>"), HMAC-SHA256 sobre el BODY CRUDO (no el JSON ya
// parseado — un solo espacio de diferencia ya rompe la firma) con el App
// Secret de la app de Meta. Comparación en tiempo constante.
export function verifyWebhookSignature(appSecret: string, rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const receivedHex = signatureHeader.slice('sha256='.length);
  const expectedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  let expectedBuffer: Buffer;
  let receivedBuffer: Buffer;
  try {
    expectedBuffer = Buffer.from(expectedHex, 'hex');
    receivedBuffer = Buffer.from(receivedHex, 'hex');
  } catch {
    return false;
  }
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
