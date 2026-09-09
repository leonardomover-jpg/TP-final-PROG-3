import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verificación de webhooks de Meta (WhatsApp Cloud API, Facebook Messenger,
 * Instagram Messaging — Etapas 16/17) — las tres comparten el mismo
 * mecanismo (`X-Hub-Signature-256` sobre el body crudo + handshake GET con
 * `hub.verify_token`), así que se extrajo una sola vez acá en vez de
 * repetirlo en `whatsapp-client.ts`/`meta-client.ts`.
 */

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
// parseado) con el App Secret de la app de Meta. Comparación en tiempo
// constante.
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
