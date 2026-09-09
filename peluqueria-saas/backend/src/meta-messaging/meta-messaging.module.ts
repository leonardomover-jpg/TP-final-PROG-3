import { Module } from '@nestjs/common';
import { MetaMessagingController } from './meta-messaging.controller';
import { MetaMessagingService } from './meta-messaging.service';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [MetaMessagingController],
  providers: [MetaMessagingService],
})
export class MetaMessagingModule {}
