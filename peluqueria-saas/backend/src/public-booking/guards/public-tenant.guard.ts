import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resuelve el tenant desde `:tenantSlug` en rutas PÚBLICAS (Etapa 18, doc
 * `22-PAGINA-PUBLICA-QR-PWA.md`) — sin JWT, así que `JwtAuthGuard` no
 * corre acá (`@Public()`). En vez de duplicar la lógica de
 * `ScheduleService.getAvailability`/`AppointmentsService.create` (Etapas
 * 9/10, ya probadas), este guard setea un `request.user` SINTÉTICO con
 * el `tenantId` resuelto — así `TenantPrismaService` (y todo lo que
 * depende de ella: `ScheduleService`, `AppointmentsService`, inyectados
 * normalmente por Nest, request-scoped) queda acotada al tenant correcto
 * sin ningún cambio en esos services. `userId: 'public-booking'` nunca se
 * usa para nada sensible (no hay auditoría de acciones públicas en esta
 * etapa) — es solo para satisfacer la forma de `AuthenticatedUser`.
 *
 * Un tenant que no existe, o que no está `active` (suspendido/cancelado),
 * no es reservable — mismo 404 genérico en ambos casos, para no filtrar
 * si un slug existe pero está suspendido.
 */
@Injectable()
export class PublicTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const slug = request.params?.tenantSlug;
    if (!slug) {
      return false;
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException('Negocio no encontrado.');
    }

    request.user = { tenantId: tenant.id, userId: 'public-booking', email: '' };
    request.tenant = tenant;
    return true;
  }
}
