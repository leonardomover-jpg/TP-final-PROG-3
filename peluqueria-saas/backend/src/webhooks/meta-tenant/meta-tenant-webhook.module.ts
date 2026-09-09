import { Module } from '@nestjs/common';
import { MetaTenantWebhookController } from './meta-tenant-webhook.controller';
import { MetaTenantWebhookService } from './meta-tenant-webhook.service';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [MetaTenantWebhookController],
  providers: [MetaTenantWebhookService],
})
export class MetaTenantWebhookModule {}
