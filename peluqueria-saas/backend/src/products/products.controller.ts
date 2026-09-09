import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { RequiresFeature } from '../feature-flags/decorators/requires-feature.decorator';

// Primer módulo opcional gateado de verdad por FeatureFlagGuard (Etapa 4):
// sin el feature flag "inventory" habilitado para el negocio, nada de acá
// responde, sin importar los permisos de rol que tenga el usuario.
@UseGuards(FeatureFlagGuard)
@RequiresFeature('inventory')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions('productos.gestionar')
  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @RequirePermissions('productos.gestionar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @RequirePermissions('productos.gestionar')
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @RequirePermissions('productos.gestionar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @RequirePermissions('productos.gestionar')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @RequirePermissions('inventario.gestionar')
  @Post(':id/stock-adjustment')
  adjustStock(@Param('id') id: string, @Body() dto: StockAdjustmentDto) {
    return this.productsService.adjustStock(id, dto);
  }
}
