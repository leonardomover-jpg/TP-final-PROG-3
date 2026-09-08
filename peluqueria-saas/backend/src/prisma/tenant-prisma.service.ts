import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from './prisma.service';
import { extendWithTenantScope, TenantScopedPrismaClient } from './tenant-scope.extension';
import { AuthenticatedUser } from '../auth/auth.types';

/**
 * Provider request-scoped: se re-crea en cada request HTTP porque necesita
 * el tenantId de ESE request (resuelto por JwtAuthGuard en `request.user`,
 * ver auth/jwt.strategy.ts). Todo service de un módulo de negocio
 * tenant-scoped (Users, Branches, Roles, etc.) inyecta esto — nunca el
 * PrismaService crudo — para que sea físicamente imposible olvidarse de
 * filtrar por tenant en un query nuevo.
 *
 * `tenantId`/`client` se resuelven perezosamente (getters), no en el
 * constructor: para una cadena de providers request-scoped, Nest puede
 * necesitar instanciar el árbol de dependencias antes de que los guards
 * globales terminen de correr sobre ESE request. Leer `request.user` recién
 * en el primer uso real (dentro del método del controller, que sí corre
 * después de los guards) evita depender de ese orden de instanciación.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  private _tenantId?: string;
  private _client?: TenantScopedPrismaClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REQUEST) private readonly request: Request & { user?: AuthenticatedUser },
  ) {}

  get tenantId(): string {
    if (!this._tenantId) {
      const tenantId = this.request.user?.tenantId;
      if (!tenantId) {
        // Nunca debería pasar: JwtAuthGuard corre antes y ya exige un JWT
        // válido con tenantId. Si pasa, es un bug de wiring, no un caso de
        // negocio — se corta acá en vez de dejar pasar un query sin scope.
        throw new UnauthorizedException('No se pudo resolver el tenant de la sesión.');
      }
      this._tenantId = tenantId;
    }
    return this._tenantId;
  }

  get client(): TenantScopedPrismaClient {
    if (!this._client) {
      this._client = extendWithTenantScope(this.prisma, this.tenantId);
    }
    return this._client;
  }
}
