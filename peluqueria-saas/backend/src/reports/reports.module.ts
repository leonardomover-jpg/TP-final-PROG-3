import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService], // AiModule (Etapa 21, IA) reusa getDashboard() para armar el contexto
})
export class ReportsModule {}
