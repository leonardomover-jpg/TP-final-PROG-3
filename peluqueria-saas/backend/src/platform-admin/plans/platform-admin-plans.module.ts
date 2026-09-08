import { Module } from '@nestjs/common';
import { PlatformAdminPlansController } from './platform-admin-plans.controller';
import { PlatformAdminPlansService } from './platform-admin-plans.service';

@Module({
  controllers: [PlatformAdminPlansController],
  providers: [PlatformAdminPlansService],
})
export class PlatformAdminPlansModule {}
