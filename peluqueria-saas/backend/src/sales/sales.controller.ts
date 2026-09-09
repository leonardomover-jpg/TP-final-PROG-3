import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { CommissionsQueryDto } from './dto/commissions.query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BranchAccessGuard } from '../branches/guards/branch-access.guard';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermissions('ventas.ver')
  @Get()
  findAll(@Query() query: ListSalesQueryDto) {
    return this.salesService.findAll(query);
  }

  // Declarado ANTES de ':id' a propósito: Nest registra las rutas en el
  // orden en que se declaran los métodos, así que si 'commissions' fuera
  // después de ':id', el router lo interpretaría como un id literal
  // ("commissions") en vez de esta ruta.
  @RequirePermissions('reportes.ver')
  @Get('commissions')
  getCommissions(@Query() query: CommissionsQueryDto) {
    return this.salesService.getCommissions(query);
  }

  @RequirePermissions('ventas.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @RequirePermissions('ventas.crear')
  @UseGuards(BranchAccessGuard)
  @Post()
  create(@Body() dto: CreateSaleDto) {
    return this.salesService.create(dto);
  }

  @RequirePermissions('ventas.anular')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelSaleDto) {
    return this.salesService.cancel(id, dto);
  }
}
