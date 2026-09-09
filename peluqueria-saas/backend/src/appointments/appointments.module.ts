import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { ScheduleModule } from '../schedule/schedule.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [ScheduleModule, WhatsAppModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService], // PublicBookingModule (Etapa 18) reusa create() para la reserva pública
})
export class AppointmentsModule {}
