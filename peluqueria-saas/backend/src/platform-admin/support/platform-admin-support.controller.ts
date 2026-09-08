import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminSupportService } from './platform-admin-support.service';
import { ListTicketsQueryDto } from './dto/list-tickets.query.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddTicketMessageDto } from './dto/add-message.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { CurrentPlatformAdmin } from '../auth/decorators/current-platform-admin.decorator';
import { AuthenticatedPlatformAdmin } from '../auth/platform-admin-auth.types';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/support/tickets')
export class PlatformAdminSupportController {
  constructor(private readonly supportService: PlatformAdminSupportService) {}

  @Get()
  findAll(@Query() query: ListTicketsQueryDto) {
    return this.supportService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.supportService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.supportService.update(id, dto, admin.platformAdminId);
  }

  @Post(':id/messages')
  addMessage(
    @Param('id') id: string,
    @Body() dto: AddTicketMessageDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.supportService.addMessage(id, dto, admin.platformAdminId);
  }
}
