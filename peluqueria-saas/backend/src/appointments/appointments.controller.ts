import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BranchAccessGuard } from '../branches/guards/branch-access.guard';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // Un único endpoint de listado con filtro por rango de fechas
  // (from/to) + sucursal/profesional/cliente/estado: las vistas de
  // día/semana/mes/lista del pedido son la misma consulta con distinto
  // rango, las arma el frontend (doc `14-AGENDA-TURNOS.md` §5).
  @RequirePermissions('turnos.ver')
  @Get()
  findAll(@Query() query: ListAppointmentsQueryDto) {
    return this.appointmentsService.findAll(query);
  }

  @RequirePermissions('turnos.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @RequirePermissions('turnos.crear')
  @UseGuards(BranchAccessGuard)
  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @RequirePermissions('turnos.editar')
  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.appointmentsService.confirm(id);
  }

  @RequirePermissions('turnos.cancelar')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto) {
    return this.appointmentsService.cancel(id, dto);
  }

  @RequirePermissions('turnos.editar')
  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.appointmentsService.complete(id);
  }

  @RequirePermissions('turnos.editar')
  @Post(':id/no-show')
  markNoShow(@Param('id') id: string) {
    return this.appointmentsService.markNoShow(id);
  }

  // Disparo manual (Etapa 16): sin "Jobs en background" todavía no hay
  // recordatorio automático — ver doc `20-WHATSAPP.md` §6.
  @RequirePermissions('turnos.editar')
  @Post(':id/send-reminder')
  sendReminder(@Param('id') id: string) {
    return this.appointmentsService.sendReminder(id);
  }
}
