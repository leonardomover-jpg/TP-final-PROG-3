import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { ListDepositsQueryDto } from './dto/list-deposits.query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @RequirePermissions('senas.gestionar')
  @Get()
  findAll(@Query() query: ListDepositsQueryDto) {
    return this.depositsService.findAll(query);
  }

  @RequirePermissions('senas.gestionar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.depositsService.findOne(id);
  }

  @RequirePermissions('senas.gestionar')
  @Post()
  create(@Body() dto: CreateDepositDto) {
    return this.depositsService.create(dto);
  }
}
