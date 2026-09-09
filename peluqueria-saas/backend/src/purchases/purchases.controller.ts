import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { RequiresFeature } from '../feature-flags/decorators/requires-feature.decorator';

@UseGuards(FeatureFlagGuard)
@RequiresFeature('inventory')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @RequirePermissions('inventario.gestionar')
  @Get()
  findAll() {
    return this.purchasesService.findAll();
  }

  @RequirePermissions('inventario.gestionar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  @RequirePermissions('inventario.gestionar')
  @Post()
  create(@Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(dto);
  }

  @RequirePermissions('inventario.gestionar')
  @Post(':id/receive')
  receive(@Param('id') id: string) {
    return this.purchasesService.receive(id);
  }

  @RequirePermissions('inventario.gestionar')
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.purchasesService.cancel(id);
  }
}
