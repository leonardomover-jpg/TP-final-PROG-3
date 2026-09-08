import { Module } from '@nestjs/common';
import { PlatformAdminFeatureFlagsController } from './platform-admin-feature-flags.controller';
import { PlatformAdminFeatureFlagsService } from './platform-admin-feature-flags.service';

@Module({
  controllers: [PlatformAdminFeatureFlagsController],
  providers: [PlatformAdminFeatureFlagsService],
})
export class PlatformAdminFeatureFlagsModule {}
