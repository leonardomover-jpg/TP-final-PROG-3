import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @RequirePermissions('reportes.ver')
  @Get('dashboard')
  getDashboard(@Query() query: DashboardQueryDto) {
    return this.reportsService.getDashboard(query);
  }

  @RequirePermissions('reportes.ver')
  @Get('sales/export')
  async exportSales(@Query() query: ExportQueryDto, @Res() res: Response) {
    const { buffer, contentType, filename } = await this.reportsService.exportSales(query);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @RequirePermissions('reportes.ver')
  @Get('appointments/export')
  async exportAppointments(@Query() query: ExportQueryDto, @Res() res: Response) {
    const { buffer, contentType, filename } = await this.reportsService.exportAppointments(query);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
