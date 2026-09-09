import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/auth.types';

/**
 * Restringe operaciones a las sucursales que el usuario tiene asignadas
 * (`UserBranch`, cargado desde `POST /users` con `branchIds` — Etapa 2),
 * salvo que tenga el permiso `sucursales.todas` (Etapa 19, doc
 * `23-SUCURSALES.md`) — la "Administrador del negocio" (dueño) lo tiene
 * automáticamente, porque ese rol de sistema incluye todos los permisos.
 *
 * Lee `branchId` de donde lo mande cada endpoint (body en un alta, query en
 * un listado/filtro) — si el request no trae `branchId` en absoluto, no hay
 * nada que restringir y se deja pasar (mismo criterio "opt-in" que
 * PlanLimitsGuard/PermissionsGuard: este guard no reemplaza la
 * autenticación ni el RBAC, solo agrega la restricción de sucursal donde se
 * aplica explícitamente vía @UseGuards).
 */
@Injectable()
export class BranchAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      return false;
    }

    const branchId: string | undefined = request.body?.branchId ?? request.query?.branchId;
    if (!branchId) {
      return true;
    }

    const [hasAllBranches, assignment] = await Promise.all([
      this.prisma.permission.findFirst({
        where: {
          key: 'sucursales.todas',
          roles: { some: { role: { users: { some: { userId: user.userId } } } } },
        },
      }),
      this.prisma.userBranch.findUnique({
        where: { userId_branchId: { userId: user.userId, branchId } },
      }),
    ]);

    if (hasAllBranches || assignment) {
      return true;
    }
    throw new ForbiddenException('No tenés acceso a esta sucursal.');
  }
}
