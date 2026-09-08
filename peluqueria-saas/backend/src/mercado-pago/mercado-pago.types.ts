export interface CreatePreferenceInput {
  title: string;
  quantity: number;
  unitPrice: number;
  externalReference: string;
  backUrls?: { success?: string; failure?: string; pending?: string };
}

export interface CreatePreferenceResult {
  id: string;
  initPoint: string;
  sandboxInitPoint: string;
}

export interface MercadoPagoPayment {
  id: string;
  status: string; // approved | pending | in_process | rejected | cancelled | refunded | charged_back
  externalReference: string | null;
  transactionAmount: number;
  raw: unknown; // respuesta completa de Mercado Pago, para guardar en SubscriptionPayment.rawPayload
}

export interface WebhookSignatureInput {
  xSignature: string;
  xRequestId?: string;
  dataId?: string;
}
