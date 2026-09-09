import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService], // PurchasesModule (Etapa 11) valida pertenencia del proveedor
})
export class SuppliersModule {}
