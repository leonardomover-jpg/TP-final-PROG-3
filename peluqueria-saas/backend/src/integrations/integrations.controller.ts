import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { ConnectMercadoPagoDto } from './dto/connect-mercado-pago.dto';
import { ConnectWhatsAppDto } from './dto/connect-whatsapp.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { RequiresFeature } from '../feature-flags/decorators/requires-feature.decorator';

// FeatureFlagGuard a nivel de clase, pero @RequiresFeature solo en los
// endpoints de WhatsApp (método, no clase) — Mercado Pago para clientes
// (Etapa 15) no está gateado por ningún flag, WhatsApp sí (ya estaba en
// el catálogo de flags desde el arranque del proyecto, sin ningún
// endpoint que lo usara hasta esta etapa).
@UseGuards(FeatureFlagGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @RequirePermissions('integraciones.gestionar')
  @Get()
  findAll() {
    return this.integrationsService.findAll();
  }

  @RequirePermissions('integraciones.gestionar')
  @Post('mercado-pago/connect')
  connectMercadoPago(@Body() dto: ConnectMercadoPagoDto) {
    return this.integrationsService.connectMercadoPago(dto);
  }

  @RequirePermissions('integraciones.gestionar')
  @Delete('mercado-pago')
  disconnectMercadoPago() {
    return this.integrationsService.disconnectMercadoPago();
  }

  @RequiresFeature('whatsapp')
  @RequirePermissions('integraciones.gestionar')
  @Post('whatsapp/connect')
  connectWhatsApp(@Body() dto: ConnectWhatsAppDto) {
    return this.integrationsService.connectWhatsApp(dto);
  }

  @RequiresFeature('whatsapp')
  @RequirePermissions('integraciones.gestionar')
  @Delete('whatsapp')
  disconnectWhatsApp() {
    return this.integrationsService.disconnectWhatsApp();
  }
}
