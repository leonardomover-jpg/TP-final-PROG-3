import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @RequirePermissions('soporte.ver')
  @Get()
  findAll() {
    return this.supportService.findAll();
  }

  @RequirePermissions('soporte.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.supportService.findOne(id);
  }

  @RequirePermissions('soporte.crear')
  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.supportService.create(dto, user.userId);
  }

  @RequirePermissions('soporte.ver')
  @Post(':id/messages')
  addMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.addMessage(id, dto, user.userId);
  }
}
