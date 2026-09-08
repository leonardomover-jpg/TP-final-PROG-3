import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { BranchesModule } from './branches/branches.module';
import { PlatformAdminAuthModule } from './platform-admin/auth/platform-admin-auth.module';
import { PlatformAdminTenantsModule } from './platform-admin/tenants/platform-admin-tenants.module';
import { PlatformAdminAuditModule } from './platform-admin/audit/platform-admin-audit.module';
import { PlatformAdminSupportModule } from './platform-admin/support/platform-admin-support.module';
import { PlatformAdminCommunicationsModule } from './platform-admin/communications/platform-admin-communications.module';
import { SupportModule } from './support/support.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global (punto 62 del pedido: brute force / rate
    // limiting). Los endpoints de login aplican un límite más estricto vía
    // @Throttle puntual — ver auth.controller.ts y platform-admin-auth.controller.ts.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    BranchesModule,
    SupportModule,
    PlatformAdminAuthModule,
    PlatformAdminTenantsModule,
    PlatformAdminAuditModule,
    PlatformAdminSupportModule,
    PlatformAdminCommunicationsModule,
  ],
  providers: [
    // Orden importa: primero rate limiting, después autenticación (JWT),
    // después autorización (permisos) — doc 04-SEGURIDAD-BASELINE §1/§2.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
