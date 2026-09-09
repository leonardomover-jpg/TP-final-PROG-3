import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService], // Products/Sales/PlanLimits lo usan para disparar avisos (Etapa 14)
})
export class NotificationsModule {}
