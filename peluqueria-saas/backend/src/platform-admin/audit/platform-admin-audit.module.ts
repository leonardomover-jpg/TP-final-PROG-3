import { Module } from '@nestjs/common';
import { PlatformAdminAuditController } from './platform-admin-audit.controller';
import { PlatformAdminAuditService } from './platform-admin-audit.service';

@Module({
  controllers: [PlatformAdminAuditController],
  providers: [PlatformAdminAuditService],
})
export class PlatformAdminAuditModule {}
