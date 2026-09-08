import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { SetProfessionalsDto } from './dto/set-professionals.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @RequirePermissions('servicios.ver')
  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  @RequirePermissions('servicios.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  // Sin PlanLimitsGuard a propósito: Plan no tiene un campo maxServices (el
  // pedido no anticipó un límite por cantidad de servicios) — doc
  // `12-SERVICIOS.md` §6.
  @RequirePermissions('servicios.crear')
  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @RequirePermissions('servicios.editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @RequirePermissions('servicios.eliminar')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }

  @RequirePermissions('servicios.editar')
  @Put(':id/professionals')
  setProfessionals(@Param('id') id: string, @Body() dto: SetProfessionalsDto) {
    return this.servicesService.setProfessionals(id, dto);
  }
}
