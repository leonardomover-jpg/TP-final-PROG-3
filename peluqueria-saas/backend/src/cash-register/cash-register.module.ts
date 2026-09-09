import { Module } from '@nestjs/common';
import { CashRegisterController } from './cash-register.controller';
import { CashRegisterService } from './cash-register.service';

@Module({
  controllers: [CashRegisterController],
  providers: [CashRegisterService],
  exports: [CashRegisterService], // SalesModule (Etapa 12) valida que la caja esté abierta
})
export class CashRegisterModule {}
