import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminBackupsService } from './platform-admin-backups.service';
import { ListBackupsQueryDto } from './dto/list-backups.query.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/backups')
export class PlatformAdminBackupsController {
  constructor(private readonly backupsService: PlatformAdminBackupsService) {}

  @Get()
  findAll(@Query() query: ListBackupsQueryDto) {
    return this.backupsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.backupsService.findOne(id);
  }

  // Sincrónico a propósito (sin "Jobs en background" todavía, ver doc
  // `28-BACKUPS.md` §4) — un dump + verificación por restauración de la
  // base de este proyecto tarda segundos, no minutos; en un negocio con
  // mucho más volumen, este mismo método es el que un cron externo
  // invocaría vía `scripts/run-backup.ts`, no necesariamente este endpoint.
  @Post('run')
  run() {
    return this.backupsService.run();
  }
}
