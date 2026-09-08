import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@Controller('webhooks/mercado-pago')
export class MercadoPagoWebhookController {
  constructor(private readonly webhookService: MercadoPagoWebhookService) {}

  // Mercado Pago manda `data.id` y `type` como query params (a veces
  // también en el body JSON, según la versión de la notificación) — se
  // acepta cualquiera de las dos formas. La query real usa un punto
  // literal en la key ("data.id"), no un objeto anidado: Express con el
  // parser por defecto NO lo interpreta como `query.data.id`.
  @HttpCode(HttpStatus.OK)
  @Post()
  handle(
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Query() query: Record<string, string>,
    @Body() body: { type?: string; topic?: string; data?: { id?: string } } | undefined,
  ) {
    const dataId = query['data.id'] ?? body?.data?.id;
    const type = query['type'] ?? query['topic'] ?? body?.type ?? body?.topic;
    return this.webhookService.process({ xSignature, xRequestId, dataId, type });
  }
}
