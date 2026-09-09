import { Module } from '@nestjs/common';
import { PlatformAdminHolidaysController } from './platform-admin-holidays.controller';
import { PlatformAdminHolidaysService } from './platform-admin-holidays.service';

@Module({
  controllers: [PlatformAdminHolidaysController],
  providers: [PlatformAdminHolidaysService],
})
export class PlatformAdminHolidaysModule {}
