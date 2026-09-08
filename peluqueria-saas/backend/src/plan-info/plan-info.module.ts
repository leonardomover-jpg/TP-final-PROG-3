import { Module } from '@nestjs/common';
import { PlanInfoController } from './plan-info.controller';
import { PlanInfoService } from './plan-info.service';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports: [PlanLimitsModule],
  controllers: [PlanInfoController],
  providers: [PlanInfoService],
})
export class PlanInfoModule {}
