import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ReportsModule } from '../reports/reports.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';

@Module({
  imports: [ReportsModule, FeatureFlagsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
