import { Module } from '@nestjs/common';
import { MercadoPagoTenantWebhookController } from './mercado-pago-tenant-webhook.controller';
import { MercadoPagoTenantWebhookService } from './mercado-pago-tenant-webhook.service';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [MercadoPagoTenantWebhookController],
  providers: [MercadoPagoTenantWebhookService],
})
export class MercadoPagoTenantWebhookModule {}
