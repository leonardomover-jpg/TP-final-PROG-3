import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { UpdateTenantFlagDto } from './dto/update-tenant-flag.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @RequirePermissions('feature_flags.ver')
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.featureFlagsService.resolveAllForTenant(user.tenantId);
  }

  @RequirePermissions('feature_flags.gestionar')
  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateTenantFlagDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.featureFlagsService.setEnabledForTenant(user.tenantId, key, dto.enabled);
  }
}
