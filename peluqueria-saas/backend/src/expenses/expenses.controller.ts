import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses.query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @RequirePermissions('gastos.ver')
  @Get()
  findAll(@Query() query: ListExpensesQueryDto) {
    return this.expensesService.findAll(query);
  }

  @RequirePermissions('gastos.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @RequirePermissions('gastos.crear')
  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.expensesService.create(dto);
  }
}
