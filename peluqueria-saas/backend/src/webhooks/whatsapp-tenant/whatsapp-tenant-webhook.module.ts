import { Module } from '@nestjs/common';
import { WhatsAppTenantWebhookController } from './whatsapp-tenant-webhook.controller';
import { WhatsAppTenantWebhookService } from './whatsapp-tenant-webhook.service';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [WhatsAppTenantWebhookController],
  providers: [WhatsAppTenantWebhookService],
})
export class WhatsAppTenantWebhookModule {}
