import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';
import { BranchAccessGuard } from './guards/branch-access.guard';

@Module({
  imports: [PlanLimitsModule],
  controllers: [BranchesController],
  providers: [BranchesService, BranchAccessGuard],
  exports: [BranchAccessGuard], // Etapa 19: reusado por Appointments/Waitlist/Sales/CashRegister
})
export class BranchesModule {}
