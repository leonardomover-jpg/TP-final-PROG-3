import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PlanLimitsGuard } from '../plan-limits/guards/plan-limits.guard';
import { LimitResource } from '../plan-limits/decorators/limit-resource.decorator';
import { SetScheduleDto } from '../common/dto/set-schedule.dto';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @RequirePermissions('sucursales.ver')
  @Get()
  findAll() {
    return this.branchesService.findAll();
  }

  @RequirePermissions('sucursales.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.branchesService.findOne(id);
  }

  @RequirePermissions('sucursales.crear')
  @UseGuards(PlanLimitsGuard)
  @LimitResource('branches')
  @Post()
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @RequirePermissions('sucursales.editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @RequirePermissions('sucursales.eliminar')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.branchesService.remove(id);
  }

  @RequirePermissions('sucursales.editar')
  @Put(':id/schedule')
  setSchedule(@Param('id') id: string, @Body() dto: SetScheduleDto) {
    return this.branchesService.setSchedule(id, dto);
  }
}
