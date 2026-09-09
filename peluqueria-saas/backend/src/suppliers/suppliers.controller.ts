import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { RequiresFeature } from '../feature-flags/decorators/requires-feature.decorator';

@UseGuards(FeatureFlagGuard)
@RequiresFeature('inventory')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @RequirePermissions('inventario.gestionar')
  @Get()
  findAll() {
    return this.suppliersService.findAll();
  }

  @RequirePermissions('inventario.gestionar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @RequirePermissions('inventario.gestionar')
  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @RequirePermissions('inventario.gestionar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @RequirePermissions('inventario.gestionar')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }
}
