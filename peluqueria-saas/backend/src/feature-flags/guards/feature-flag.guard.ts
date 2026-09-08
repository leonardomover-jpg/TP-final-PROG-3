import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagsService } from '../feature-flags.service';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';

// Guard LOCAL (no global): se aplica con
// @UseGuards(FeatureFlagGuard) + @RequiresFeature('key') en los módulos
// opcionales que lo necesiten (Etapa 13 en adelante). Corre después de
// JwtAuthGuard/PermissionsGuard, así que `request.user` ya está resuelto.
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      return false;
    }

    const resolution = await this.featureFlagsService.resolveOneForTenant(user.tenantId, requiredFeature);
    if (!resolution.enabled) {
      throw new ForbiddenException(
        resolution.reason ?? `El módulo "${requiredFeature}" no está activado para tu negocio.`,
      );
    }
    return true;
  }
}
