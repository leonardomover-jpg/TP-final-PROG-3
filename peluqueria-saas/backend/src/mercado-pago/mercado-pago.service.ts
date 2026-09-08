import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CreatePreferenceInput,
  CreatePreferenceResult,
  MercadoPagoPayment,
  WebhookSignatureInput,
} from './mercado-pago.types';

/**
 * Encapsula TODA la comunicación con Mercado Pago (doc 01 §5, principio del
 * punto 93: "todas las integraciones externas deben estar encapsuladas").
 * Ningún otro módulo hace `fetch` a `api.mercadopago.com` directamente —
 * siempre pasa por acá, así cambiar de proveedor de pagos en el futuro no
 * implica tocar `SubscriptionsService` ni el controller de webhooks.
 *
 * Es la cuenta de Mercado Pago DE LA PLATAFORMA (cobra la suscripción SaaS
 * a cada negocio) — no confundir con Mercado Pago para clientes finales del
 * negocio (señas/ventas), que es un `TenantIntegration` por-negocio de la
 * Etapa 15 (doc 05 §6).
 *
 * Fuente de la forma exacta de la API (endpoint, headers, algoritmo de
 * firma): documentación oficial de Mercado Pago Developers (Checkout Pro /
 * Preferences API, notificaciones Webhooks) consultada al implementar esta
 * etapa — punto 94 del pedido: nunca se inventó un endpoint ni un formato.
 */
@Injectable()
export class MercadoPagoService {
  private readonly baseUrl = process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com';

  private get accessToken(): string {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) {
      throw new InternalServerErrorException('Mercado Pago no está configurado en este ambiente.');
    }
    return token;
  }

  private get webhookSecret(): string {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('Mercado Pago no está configurado en este ambiente.');
    }
    return secret;
  }

  // POST /checkout/preferences — Checkout Pro. Devuelve init_point (URL de
  // pago en producción) y sandbox_init_point (para probar sin cobrar de
  // verdad). El comprador nunca ingresa datos de tarjeta en nuestro
  // dominio: todo el checkout ocurre en la página hospedada por Mercado
  // Pago — así "no almacenar tarjetas" (doc 01) se cumple por diseño, no
  // por disciplina.
  async createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult> {
    const notificationUrl = process.env.APP_PUBLIC_URL
      ? `${process.env.APP_PUBLIC_URL}/api/v1/webhooks/mercado-pago`
      : undefined;

    const response = await fetch(`${this.baseUrl}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
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
      throw new InternalServerErrorException(
        `Mercado Pago rechazó la creación de la preferencia de pago: ${body}`,
      );
    }

    const data = await response.json();
    return {
      id: String(data.id),
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
    };
  }

  // GET /v1/payments/{id} — se llama SIEMPRE después de validar la firma
  // del webhook, nunca se confía en los datos que vengan en el body de la
  // notificación (que solo trae el id, no el estado real del pago).
  async getPayment(paymentId: string): Promise<MercadoPagoPayment> {
    const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
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

  // Valida el header `x-signature` (formato "ts=...,v1=...") reconstruyendo
  // el mismo "manifest" que Mercado Pago firmó del lado de ellos:
  //   id:{dataId};request-id:{xRequestId};ts:{ts};
  // (cada segmento se omite por completo si el dato de origen no vino).
  // HMAC-SHA256 con el secreto de webhook configurado en "Tus
  // integraciones" del dashboard de Mercado Pago; comparación en tiempo
  // constante para no filtrar el secreto por timing attack.
  verifyWebhookSignature(input: WebhookSignatureInput): boolean {
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

    const expectedHex = createHmac('sha256', this.webhookSecret).update(manifest).digest('hex');

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
}
