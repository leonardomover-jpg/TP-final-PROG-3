import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, RawBodyRequest, Req, Res, Headers } from '@nestjs/common';
import { Request, Response } from 'express';
import { WhatsAppTenantWebhookService } from './whatsapp-tenant-webhook.service';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@Controller('webhooks/whatsapp/tenant')
export class WhatsAppTenantWebhookController {
  constructor(private readonly webhookService: WhatsAppTenantWebhookService) {}

  // Handshake de suscripción (una sola vez, al configurar la URL en el
  // dashboard de Meta) — responde el hub.challenge como TEXTO PLANO, no JSON
  // (así lo exige la API de Meta).
  @Get(':tenantId')
  async verify(
    @Param('tenantId') tenantId: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const echoed = await this.webhookService.verifyHandshake(tenantId, mode, token, challenge);
    res.status(HttpStatus.OK).send(echoed);
  }

  // Mensajes/eventos entrantes — la firma X-Hub-Signature-256 se verifica
  // sobre `request.rawBody` (ver main.ts: NestFactory.create con
  // rawBody: true), nunca sobre el body ya parseado.
  @HttpCode(HttpStatus.OK)
  @Post(':tenantId')
  handle(
    @Param('tenantId') tenantId: string,
    @Headers('x-hub-signature-256') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.webhookService.processIncoming(tenantId, request.rawBody as Buffer, signature);
  }
}
