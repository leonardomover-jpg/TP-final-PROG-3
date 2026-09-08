import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ProfessionalsService } from './professionals.service';
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { SetScheduleDto } from './dto/set-schedule.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PlanLimitsGuard } from '../plan-limits/guards/plan-limits.guard';
import { LimitResource } from '../plan-limits/decorators/limit-resource.decorator';

@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @RequirePermissions('profesionales.ver')
  @Get()
  findAll() {
    return this.professionalsService.findAll();
  }

  @RequirePermissions('profesionales.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.professionalsService.findOne(id);
  }

  @RequirePermissions('profesionales.crear')
  @UseGuards(PlanLimitsGuard)
  @LimitResource('professionals')
  @Post()
  create(@Body() dto: CreateProfessionalDto) {
    return this.professionalsService.create(dto);
  }

  @RequirePermissions('profesionales.editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProfessionalDto) {
    return this.professionalsService.update(id, dto);
  }

  @RequirePermissions('profesionales.eliminar')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.professionalsService.remove(id);
  }

  @RequirePermissions('profesionales.editar')
  @Put(':id/schedule')
  setSchedule(@Param('id') id: string, @Body() dto: SetScheduleDto) {
    return this.professionalsService.setSchedule(id, dto);
  }
}
