import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminHolidaysService } from './platform-admin-holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/holidays')
export class PlatformAdminHolidaysController {
  constructor(private readonly holidaysService: PlatformAdminHolidaysService) {}

  @Get()
  findAll(@Query('year') year?: string) {
    return this.holidaysService.findAll(year ? Number(year) : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.holidaysService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateHolidayDto) {
    return this.holidaysService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHolidayDto) {
    return this.holidaysService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.holidaysService.remove(id);
  }
}
