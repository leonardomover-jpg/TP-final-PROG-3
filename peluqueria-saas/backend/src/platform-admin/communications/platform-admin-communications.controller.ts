import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminCommunicationsService } from './platform-admin-communications.service';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { ListCommunicationsQueryDto } from './dto/list-communications.query.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { CurrentPlatformAdmin } from '../auth/decorators/current-platform-admin.decorator';
import { AuthenticatedPlatformAdmin } from '../auth/platform-admin-auth.types';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/communications')
export class PlatformAdminCommunicationsController {
  constructor(private readonly communicationsService: PlatformAdminCommunicationsService) {}

  @Get()
  findAll(@Query() query: ListCommunicationsQueryDto) {
    return this.communicationsService.findAll(query);
  }

  @Post()
  create(
    @Body() dto: CreateCommunicationDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.communicationsService.create(dto, admin.platformAdminId);
  }
}
