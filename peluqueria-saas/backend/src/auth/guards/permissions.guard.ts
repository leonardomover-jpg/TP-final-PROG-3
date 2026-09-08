import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth.types';

// Registrado globalmente (ver app.module.ts), después de JwtAuthGuard. Si un
// handler no declara @RequirePermissions, no exige nada extra más allá de
// estar autenticado (RBAC es opt-in explícito por endpoint).
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      return false;
    }

    const grantedPermissions = await this.prisma.permission.findMany({
      where: {
        roles: { some: { role: { users: { some: { userId: user.userId } } } } },
      },
      select: { key: true },
    });
    const grantedKeys = new Set(grantedPermissions.map((p) => p.key));
    const hasAll = required.every((permission) => grantedKeys.has(permission));

    if (!hasAll) {
      throw new ForbiddenException('No tenés permiso para realizar esta acción.');
    }
    return true;
  }
}
