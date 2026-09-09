import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { ScheduleModule } from '../schedule/schedule.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [ScheduleModule, WhatsAppModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
