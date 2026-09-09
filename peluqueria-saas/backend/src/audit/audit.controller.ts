import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermissions('auditoria.ver')
  @Get()
  findAll(@Query() query: ListAuditLogsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auditService.findAll(user.tenantId, query);
  }
}
