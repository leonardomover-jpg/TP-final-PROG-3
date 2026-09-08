import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PlanLimitsGuard } from '../plan-limits/guards/plan-limits.guard';
import { LimitResource } from '../plan-limits/decorators/limit-resource.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions('usuarios.ver')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @RequirePermissions('usuarios.ver')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @RequirePermissions('usuarios.crear')
  @UseGuards(PlanLimitsGuard)
  @LimitResource('users')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @RequirePermissions('usuarios.editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @RequirePermissions('usuarios.eliminar')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
