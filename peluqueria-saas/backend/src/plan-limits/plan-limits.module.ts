import { Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';
import { PlanLimitsGuard } from './guards/plan-limits.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [PlanLimitsService, PlanLimitsGuard],
  exports: [PlanLimitsService, PlanLimitsGuard],
})
export class PlanLimitsModule {}
