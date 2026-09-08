import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateClientNoteDto } from './dto/create-client-note.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { PlanLimitsGuard } from '../plan-limits/guards/plan-limits.guard';
import { LimitResource } from '../plan-limits/decorators/limit-resource.decorator';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @RequirePermissions('clientes.ver')
  @Get()
  findAll() {
    return this.clientsService.findAll();
  }

  @RequirePermissions('clientes.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @RequirePermissions('clientes.crear')
  @UseGuards(PlanLimitsGuard)
  @LimitResource('clients')
  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @RequirePermissions('clientes.editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @RequirePermissions('clientes.eliminar')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }

  @RequirePermissions('clientes.ver')
  @Get(':id/notes')
  listNotes(@Param('id') id: string) {
    return this.clientsService.listNotes(id);
  }

  @RequirePermissions('clientes.editar')
  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body() dto: CreateClientNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.addNote(id, user.userId, dto);
  }
}
