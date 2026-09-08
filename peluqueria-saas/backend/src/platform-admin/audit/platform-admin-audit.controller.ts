import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminAuditService } from './platform-admin-audit.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/audit-logs')
export class PlatformAdminAuditController {
  constructor(private readonly auditService: PlatformAdminAuditService) {}

  @Get()
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.findAll(query);
  }
}
