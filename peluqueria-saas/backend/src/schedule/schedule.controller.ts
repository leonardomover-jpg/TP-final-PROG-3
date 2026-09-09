import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { ListExceptionsQueryDto } from './dto/list-exceptions.query.dto';
import { SetHolidayOverrideDto } from './dto/set-holiday-override.dto';
import { AvailabilityQueryDto } from './dto/availability.query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @RequirePermissions('horarios.gestionar')
  @Post('exceptions')
  createException(@Body() dto: CreateExceptionDto) {
    return this.scheduleService.createException(dto);
  }

  @RequirePermissions('horarios.ver')
  @Get('exceptions')
  listExceptions(@Query() query: ListExceptionsQueryDto) {
    return this.scheduleService.listExceptions(query);
  }

  @RequirePermissions('horarios.gestionar')
  @Delete('exceptions/:id')
  async removeException(@Param('id') id: string) {
    await this.scheduleService.removeException(id);
    return { success: true };
  }

  @RequirePermissions('horarios.ver')
  @Get('holidays')
  listHolidays(@Query('year') year?: string) {
    return this.scheduleService.listHolidays(year ? Number(year) : undefined);
  }

  @RequirePermissions('horarios.gestionar')
  @Patch('holidays/:holidayId/override')
  setHolidayOverride(@Param('holidayId') holidayId: string, @Body() dto: SetHolidayOverrideDto) {
    return this.scheduleService.setHolidayOverride(holidayId, dto);
  }

  @RequirePermissions('horarios.ver')
  @Get('availability')
  getAvailability(@Query() query: AvailabilityQueryDto) {
    return this.scheduleService.getAvailability(query);
  }
}
