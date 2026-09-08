import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

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
}
