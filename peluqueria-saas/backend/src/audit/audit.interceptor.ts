import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { concatMap, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Auditoría "de cobertura amplia" (Etapa 22, doc `26-AUDITORIA-OBSERVABILIDAD.md`):
 * registrado GLOBALMENTE (`APP_INTERCEPTOR`, app.module.ts), complementa —
 * no reemplaza — los `auditLog.create` puntuales ya existentes (login,
 * alta de tenant, cambios de estado en platform-admin/tenants, etc., que
 * guardan `beforeData`/`afterData` con detalle semántico). Este
 * interceptor cubre TODO lo demás: cualquier mutación exitosa (POST/PUT/
 * PATCH/DELETE) en cualquier endpoint autenticado, con una entrada
 * genérica (método + entidad + actor + ip), sin diff de antes/después.
 * Es intencional que una acción ya logueada a mano termine con dos filas
 * (una genérica de acá, una semántica de la de antes) — capas
 * complementarias, no duplicación por error.
 *
 * Solo loguea si el handler resolvió sin excepción (una excepción nunca
 * llega al `concatMap` de abajo, la agarra el filtro global antes) Y
 * `request.user` está resuelto (JwtAuthGuard/PlatformAdminJwtAuthGuard ya
 * corrieron). Rutas sin actor identificable (login, webhooks, catálogo
 * público) quedan afuera solas, porque
 * `request.user` nunca se llega a setear ahí — no hace falta una
 * lista de exclusión por path. La única excepción explícita es el
 * `request.user` SINTÉTICO de `PublicTenantGuard` (Etapa 18,
 * `userId: 'public-booking'`): reservas públicas anónimas no generan
 * auditoría de "usuario", a propósito.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    // concatMap (no tap): la escritura del AuditLog se espera ANTES de
    // que la respuesta baje al cliente — necesario para que un test que
    // hace la mutación y enseguida lee GET /audit vea la fila sin una
    // condición de carrera. Solo corre sobre un next() exitoso: una
    // excepción nunca llega acá (la agarra el filtro global antes), así
    // que no hace falta chequear el status code a mano.
    return next.handle().pipe(
      concatMap(async (data) => {
        await this.logIfApplicable(request);
        return data;
      }),
    );
  }

  private async logIfApplicable(request: Request) {
    const user = request.user as
      | { userId: string; tenantId: string; email: string }
      | { platformAdminId: string; email: string }
      | undefined;
    if (!user) {
      return;
    }

    const isPlatformAdmin = 'platformAdminId' in user;
    if (!isPlatformAdmin && (user as { userId: string }).userId === 'public-booking') {
      return; // reservas públicas anónimas (Etapa 18) — sin auditoría de "usuario"
    }

    const path = request.originalUrl.split('?')[0];
    const segments = path.split('/').filter(Boolean).filter((s) => s !== 'api' && s !== 'v1');
    if (segments[0] === 'platform-admin') {
      segments.shift();
    }
    const entityType = segments[0] ?? 'unknown';
    const entityId = (request.params as Record<string, string> | undefined)?.id;

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: isPlatformAdmin ? null : (user as { tenantId: string }).tenantId,
          actorType: isPlatformAdmin ? 'platform_admin' : 'user',
          actorId: isPlatformAdmin
            ? (user as { platformAdminId: string }).platformAdminId
            : (user as { userId: string }).userId,
          action: `${request.method.toLowerCase()}:${entityType}`,
          entityType,
          entityId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });
    } catch {
      // La auditoría nunca debe romper la request que ya respondió 2xx —
      // si falla el insert (ej. DB momentáneamente caída), se pierde esa
      // fila de auditoría genérica, no la operación de negocio ya hecha.
    }
  }
}
