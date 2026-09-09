import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [NotificationsModule, BranchesModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
