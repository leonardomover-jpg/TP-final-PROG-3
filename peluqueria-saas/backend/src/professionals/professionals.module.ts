import { Module } from '@nestjs/common';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports: [PlanLimitsModule],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService],
})
export class ProfessionalsModule {}
