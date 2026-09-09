import { Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, RawBodyRequest, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { MetaTenantWebhookService } from './meta-tenant-webhook.service';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@Controller('webhooks')
export class MetaTenantWebhookController {
  constructor(private readonly webhookService: MetaTenantWebhookService) {}

  @Get('facebook/tenant/:tenantId')
  verifyFacebook(
    @Param('tenantId') tenantId: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    return this.verify('facebook', tenantId, mode, token, challenge, res);
  }

  @HttpCode(HttpStatus.OK)
  @Post('facebook/tenant/:tenantId')
  handleFacebook(
    @Param('tenantId') tenantId: string,
    @Headers('x-hub-signature-256') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.webhookService.processIncoming('facebook', tenantId, request.rawBody as Buffer, signature);
  }

  @Get('instagram/tenant/:tenantId')
  verifyInstagram(
    @Param('tenantId') tenantId: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    return this.verify('instagram', tenantId, mode, token, challenge, res);
  }

  @HttpCode(HttpStatus.OK)
  @Post('instagram/tenant/:tenantId')
  handleInstagram(
    @Param('tenantId') tenantId: string,
    @Headers('x-hub-signature-256') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.webhookService.processIncoming('instagram', tenantId, request.rawBody as Buffer, signature);
  }

  private async verify(
    provider: 'facebook' | 'instagram',
    tenantId: string,
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    res: Response,
  ) {
    const echoed = await this.webhookService.verifyHandshake(provider, tenantId, mode, token, challenge);
    res.status(HttpStatus.OK).send(echoed);
  }
}
