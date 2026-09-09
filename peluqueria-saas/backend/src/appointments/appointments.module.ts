import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { ScheduleModule } from '../schedule/schedule.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [ScheduleModule, WhatsAppModule, BranchesModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService], // PublicBookingModule (Etapa 18) reusa create() para la reserva pública
})
export class AppointmentsModule {}
