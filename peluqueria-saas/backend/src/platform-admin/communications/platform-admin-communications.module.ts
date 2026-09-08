import { Module } from '@nestjs/common';
import { PlatformAdminCommunicationsController } from './platform-admin-communications.controller';
import { PlatformAdminCommunicationsService } from './platform-admin-communications.service';

@Module({
  controllers: [PlatformAdminCommunicationsController],
  providers: [PlatformAdminCommunicationsService],
})
export class PlatformAdminCommunicationsModule {}
