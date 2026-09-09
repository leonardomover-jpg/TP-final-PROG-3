import { InternalServerErrorException } from '@nestjs/common';

export interface MetaMessagingCredentials {
  baseUrl: string;
  accessToken: string;
  externalAccountId: string; // Page ID (Facebook) o IG Business Account ID (Instagram)
  appSecret: string;
  verifyToken: string;
}

/**
 * Funciones puras de comunicación con la Graph API de Meta para Facebook
 * Messenger e Instagram Messaging (Etapa 17, doc
 * `21-INSTAGRAM-FACEBOOK.md`). Mismo molde que `mercado-pago-client.ts`/
 * `whatsapp-client.ts`: parametrizadas por credenciales, nunca leen
 * variables de entorno. La verificación de firma/handshake del webhook es
 * la MISMA que WhatsApp (mismo mecanismo de Meta) — ver
 * `src/common/crypto/meta-webhook-signature.ts`.
 *
 * Fuente de la forma exacta de la API: documentación oficial de Meta for
 * Developers (Messenger Platform / Instagram Messaging API) — punto 94
 * del pedido: nunca se inventó un endpoint ni un formato.
 */

// POST /{page-id}/messages — Messenger Platform, mensaje de texto simple
// dentro de la ventana de 24hs desde el último mensaje del cliente.
export async function sendFacebookMessage(credentials: MetaMessagingCredentials, recipientId: string, text: string): Promise<{ id: string }> {
  return sendGraphMessage(credentials, recipientId, text);
}

// POST /{ig-business-account-id}/messages — Instagram Messaging API,
// misma forma de request que Messenger.
export async function sendInstagramMessage(credentials: MetaMessagingCredentials, recipientId: string, text: string): Promise<{ id: string }> {
  return sendGraphMessage(credentials, recipientId, text);
}

async function sendGraphMessage(credentials: MetaMessagingCredentials, recipientId: string, text: string): Promise<{ id: string }> {
  const response = await fetch(`${credentials.baseUrl}/${credentials.externalAccountId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new InternalServerErrorException(`Meta rechazó el envío del mensaje: ${errBody}`);
  }

  const data = await response.json();
  return { id: data.message_id ?? '' };
}

// GET /{external-account-id} — confirma que el access token y el id de la
// página/cuenta están relacionados de verdad antes de guardarlos (mismo
// principio ya aplicado con Mercado Pago/WhatsApp: no asumir, verificar).
export async function validateAccessToken(baseUrl: string, externalAccountId: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`${baseUrl}/${externalAccountId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.ok;
}
