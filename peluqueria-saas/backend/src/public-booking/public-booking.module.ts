import { Module } from '@nestjs/common';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { PublicTenantGuard } from './guards/public-tenant.guard';
import { ScheduleModule } from '../schedule/schedule.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports: [ScheduleModule, AppointmentsModule, PlanLimitsModule],
  controllers: [PublicBookingController],
  providers: [PublicBookingService, PublicTenantGuard],
})
export class PublicBookingModule {}
