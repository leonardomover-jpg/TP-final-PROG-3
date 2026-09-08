import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminTenantsService } from './platform-admin-tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants.query.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { CurrentPlatformAdmin } from '../auth/decorators/current-platform-admin.decorator';
import { AuthenticatedPlatformAdmin } from '../auth/platform-admin-auth.types';
import { Public } from '../../auth/decorators/public.decorator';

// @Public() = no pasa por el JwtAuthGuard de negocio (que no tiene nada que
// ver con este panel). @UseGuards(PlatformAdminJwtAuthGuard) es la
// autenticación real acá.
@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/tenants')
export class PlatformAdminTenantsController {
  constructor(private readonly tenantsService: PlatformAdminTenantsService) {}

  @Get()
  findAll(@Query() query: ListTenantsQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTenantDto, @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.tenantsService.create(dto, admin.platformAdminId);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.tenantsService.suspend(id, admin.platformAdminId);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.tenantsService.reactivate(id, admin.platformAdminId);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.tenantsService.cancel(id, admin.platformAdminId);
  }
}
