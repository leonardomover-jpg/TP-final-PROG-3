import { Module } from '@nestjs/common';
import { PlatformAdminSubscriptionsController } from './platform-admin-subscriptions.controller';
import { PlatformAdminSubscriptionsService } from './platform-admin-subscriptions.service';

@Module({
  controllers: [PlatformAdminSubscriptionsController],
  providers: [PlatformAdminSubscriptionsService],
})
export class PlatformAdminSubscriptionsModule {}
