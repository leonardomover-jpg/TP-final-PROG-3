import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PointsService } from './points.service';
import { AwardPointsDto } from './dto/award-points.dto';
import { RedeemPointsDto } from './dto/redeem-points.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { RequiresFeature } from '../feature-flags/decorators/requires-feature.decorator';

@UseGuards(FeatureFlagGuard)
@RequiresFeature('points')
@Controller('points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @RequirePermissions('puntos.gestionar')
  @Get('balance/:clientId')
  getBalance(@Param('clientId') clientId: string) {
    return this.pointsService.getBalance(clientId);
  }

  @RequirePermissions('puntos.gestionar')
  @Get('transactions')
  getTransactions(@Query('clientId') clientId?: string) {
    return this.pointsService.getTransactions(clientId);
  }

  @RequirePermissions('puntos.gestionar')
  @Post('award')
  award(@Body() dto: AwardPointsDto) {
    return this.pointsService.award(dto);
  }

  @RequirePermissions('puntos.gestionar')
  @Post('redeem')
  redeem(@Body() dto: RedeemPointsDto) {
    return this.pointsService.redeem(dto);
  }
}
