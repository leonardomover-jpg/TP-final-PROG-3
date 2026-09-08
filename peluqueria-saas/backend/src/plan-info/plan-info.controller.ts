import { Controller, Get } from '@nestjs/common';
import { PlanInfoService } from './plan-info.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

// Sin @RequirePermissions a propósito: cualquier usuario autenticado del
// negocio puede ver el plan y el uso actual (baja sensibilidad, útil para
// un futuro dashboard/onboarding).
@Controller('plan')
export class PlanInfoController {
  constructor(private readonly planInfoService: PlanInfoService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.planInfoService.getForTenant(user.tenantId);
  }
}
