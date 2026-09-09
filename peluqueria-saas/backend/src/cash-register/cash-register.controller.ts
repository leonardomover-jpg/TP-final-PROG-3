import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CashRegisterService } from './cash-register.service';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto';
import { CloseCashRegisterDto } from './dto/close-cash-register.dto';
import { ListCashRegistersQueryDto } from './dto/list-cash-registers.query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { BranchAccessGuard } from '../branches/guards/branch-access.guard';

@Controller('cash-register')
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  @RequirePermissions('caja.ver')
  @Get()
  findAll(@Query() query: ListCashRegistersQueryDto) {
    return this.cashRegisterService.findAll(query);
  }

  @RequirePermissions('caja.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cashRegisterService.findOne(id);
  }

  @RequirePermissions('caja.abrir')
  @UseGuards(BranchAccessGuard)
  @Post('open')
  open(@Body() dto: OpenCashRegisterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cashRegisterService.open(dto, user.userId);
  }

  @RequirePermissions('caja.cerrar')
  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseCashRegisterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cashRegisterService.close(id, dto, user.userId);
  }
}
