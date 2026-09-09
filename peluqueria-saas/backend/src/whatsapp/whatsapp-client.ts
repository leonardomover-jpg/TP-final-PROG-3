import { InternalServerErrorException } from '@nestjs/common';
import { verifyHandshake, verifyWebhookSignature } from '../common/crypto/meta-webhook-signature';

export { verifyHandshake, verifyWebhookSignature };

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
