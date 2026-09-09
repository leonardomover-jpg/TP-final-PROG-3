import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { RequiresFeature } from '../feature-flags/decorators/requires-feature.decorator';

@UseGuards(FeatureFlagGuard)
@RequiresFeature('referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @RequirePermissions('referidos.gestionar')
  @Get()
  findAll() {
    return this.referralsService.findAll();
  }

  @RequirePermissions('referidos.gestionar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.referralsService.findOne(id);
  }

  @RequirePermissions('referidos.gestionar')
  @Post()
  create(@Body() dto: CreateReferralDto) {
    return this.referralsService.create(dto);
  }

  @RequirePermissions('referidos.gestionar')
  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.referralsService.complete(id);
  }
}
