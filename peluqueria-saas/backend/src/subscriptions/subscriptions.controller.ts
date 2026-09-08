import { Body, Controller, Get, Post } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SelectPlanDto } from './dto/select-plan.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @RequirePermissions('suscripcion.ver')
  @Get()
  get() {
    return this.subscriptionsService.getForTenant();
  }

  @RequirePermissions('suscripcion.gestionar')
  @Post('select-plan')
  selectPlan(@Body() dto: SelectPlanDto) {
    return this.subscriptionsService.selectPlan(dto);
  }

  @RequirePermissions('suscripcion.gestionar')
  @Post('checkout')
  createCheckout(@Body() dto: CreateCheckoutDto) {
    return this.subscriptionsService.createCheckout(dto);
  }
}
