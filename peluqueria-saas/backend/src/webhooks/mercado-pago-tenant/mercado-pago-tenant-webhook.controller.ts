import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { MercadoPagoTenantWebhookService } from './mercado-pago-tenant-webhook.service';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@Controller('webhooks/mercado-pago/tenant')
export class MercadoPagoTenantWebhookController {
  constructor(private readonly webhookService: MercadoPagoTenantWebhookService) {}

  // Mismo formato de notificación que el webhook de plataforma (Etapa 5) —
  // `data.id`/`type` como query params o en el body, según la versión.
  @HttpCode(HttpStatus.OK)
  @Post(':tenantId')
  handle(
    @Param('tenantId') tenantId: string,
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Query() query: Record<string, string>,
    @Body() body: { type?: string; topic?: string; data?: { id?: string } } | undefined,
  ) {
    const dataId = query['data.id'] ?? body?.data?.id;
    const type = query['type'] ?? query['topic'] ?? body?.type ?? body?.topic;
    return this.webhookService.process(tenantId, { xSignature, xRequestId, dataId, type });
  }
}
