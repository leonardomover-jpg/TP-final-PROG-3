import { Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';
import { PlanLimitsGuard } from './guards/plan-limits.guard';

@Module({
  providers: [PlanLimitsService, PlanLimitsGuard],
  exports: [PlanLimitsService, PlanLimitsGuard],
})
export class PlanLimitsModule {}
