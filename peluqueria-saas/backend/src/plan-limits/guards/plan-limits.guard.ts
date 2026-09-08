import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanLimitsService } from '../plan-limits.service';
import { LIMIT_RESOURCE_KEY } from '../decorators/limit-resource.decorator';
import { LimitableResource } from '../plan-limits.types';
import { AuthenticatedUser } from '../../auth/auth.types';

@Injectable()
export class PlanLimitsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planLimitsService: PlanLimitsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<LimitableResource | undefined>(
      LIMIT_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!resource) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      return false;
    }

    // Lanza ForbiddenException si ya está en el límite — mensaje claro,
    // no un booleano genérico (doc 05 §2).
    await this.planLimitsService.assertCanCreate(user.tenantId, resource);
    return true;
  }
}
