import { Module } from '@nestjs/common';
import { PlatformAdminSupportController } from './platform-admin-support.controller';
import { PlatformAdminSupportService } from './platform-admin-support.service';

@Module({
  controllers: [PlatformAdminSupportController],
  providers: [PlatformAdminSupportService],
})
export class PlatformAdminSupportModule {}
