import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService], // PurchasesModule (Etapa 11) lo usa para incrementar stock al recibir
})
export class ProductsModule {}
