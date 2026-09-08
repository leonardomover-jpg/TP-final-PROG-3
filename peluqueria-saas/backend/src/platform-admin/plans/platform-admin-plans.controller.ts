import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminPlansService } from './platform-admin-plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { SetPlanFeaturesDto } from './dto/set-plan-features.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/plans')
export class PlatformAdminPlansController {
  constructor(private readonly plansService: PlatformAdminPlansService) {}

  @Get()
  findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.plansService.archive(id);
  }

  @Patch(':id/features')
  setFeatures(@Param('id') id: string, @Body() dto: SetPlanFeaturesDto) {
    return this.plansService.setFeatures(id, dto);
  }
}
