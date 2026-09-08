import { Module } from '@nestjs/common';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { MercadoPagoModule } from '../../mercado-pago/mercado-pago.module';

@Module({
  imports: [MercadoPagoModule],
  controllers: [MercadoPagoWebhookController],
  providers: [MercadoPagoWebhookService],
})
export class MercadoPagoWebhookModule {}
