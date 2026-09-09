import { Module } from '@nestjs/common';
import { PlatformAdminBackupsController } from './platform-admin-backups.controller';
import { PlatformAdminBackupsService } from './platform-admin-backups.service';

@Module({
  controllers: [PlatformAdminBackupsController],
  providers: [PlatformAdminBackupsService],
  exports: [PlatformAdminBackupsService], // scripts/run-backup.ts (Etapa 24) reusa el mismo service
})
export class PlatformAdminBackupsModule {}
