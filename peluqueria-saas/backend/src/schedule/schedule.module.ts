import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService], // AppointmentsModule (Etapa 10) reusa getAvailability()
})
export class ScheduleModule {}
