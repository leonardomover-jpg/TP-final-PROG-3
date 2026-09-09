import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { ListWaitlistQueryDto } from './dto/list-waitlist.query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

// Reusa los permisos turnos.* (Etapa 2) — la lista de espera es parte del
// mismo módulo "Agenda y Turnos" del roadmap, no se introduce un permiso
// nuevo sin un caso concreto que lo justifique.
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @RequirePermissions('turnos.ver')
  @Get()
  findAll(@Query() query: ListWaitlistQueryDto) {
    return this.waitlistService.findAll(query);
  }

  @RequirePermissions('turnos.crear')
  @Post()
  create(@Body() dto: CreateWaitlistEntryDto) {
    return this.waitlistService.create(dto);
  }

  @RequirePermissions('turnos.cancelar')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.waitlistService.remove(id);
    return { success: true };
  }
}
