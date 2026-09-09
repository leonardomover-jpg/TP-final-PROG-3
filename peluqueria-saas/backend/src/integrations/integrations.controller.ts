import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { ConnectMercadoPagoDto } from './dto/connect-mercado-pago.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

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
}
