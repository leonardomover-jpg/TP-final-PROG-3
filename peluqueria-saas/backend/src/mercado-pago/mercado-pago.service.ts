import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as client from './mercado-pago-client';
import { CreatePreferenceInput, CreatePreferenceResult, MercadoPagoPayment, WebhookSignatureInput } from './mercado-pago.types';

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
 * Etapa 15 (doc 05 §6, `src/integrations/`, `src/deposits/`). Esta clase es
 * un wrapper fino sobre `mercado-pago-client.ts` (funciones puras
 * parametrizadas por credenciales, extraídas en la Etapa 15 para
 * reusarlas también con las credenciales cifradas de cada tenant) que
 * resuelve las credenciales desde variables de entorno — su comportamiento
 * externo es idéntico al de antes de esa extracción.
 *
 * Fuente de la forma exacta de la API (endpoint, headers, algoritmo de
 * firma): documentación oficial de Mercado Pago Developers (Checkout Pro /
 * Preferences API, notificaciones Webhooks) consultada al implementar esta
 * etapa — punto 94 del pedido: nunca se inventó un endpoint ni un formato.
 */
@Injectable()
export class MercadoPagoService {
  private get credentials(): client.MercadoPagoCredentials {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!accessToken || !webhookSecret) {
      throw new InternalServerErrorException('Mercado Pago no está configurado en este ambiente.');
    }
    return {
      baseUrl: process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com',
      accessToken,
      webhookSecret,
    };
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
    return client.createPreference(this.credentials, input, notificationUrl);
  }

  // GET /v1/payments/{id} — se llama SIEMPRE después de validar la firma
  // del webhook, nunca se confía en los datos que vengan en el body de la
  // notificación (que solo trae el id, no el estado real del pago).
  async getPayment(paymentId: string): Promise<MercadoPagoPayment> {
    return client.getPayment(this.credentials, paymentId);
  }

  // Valida el header `x-signature` (formato "ts=...,v1=...") reconstruyendo
  // el mismo "manifest" que Mercado Pago firmó del lado de ellos:
  //   id:{dataId};request-id:{xRequestId};ts:{ts};
  // (cada segmento se omite por completo si el dato de origen no vino).
  // HMAC-SHA256 con el secreto de webhook configurado en "Tus
  // integraciones" del dashboard de Mercado Pago; comparación en tiempo
  // constante para no filtrar el secreto por timing attack.
  verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    return client.verifyWebhookSignature(this.credentials, input);
  }
}
