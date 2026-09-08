import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Cliente Prisma "crudo", sin scope de tenant. Solo se usa para:
// - operaciones de plataforma (Tenant, PlatformAdmin, Plan, FeatureFlag, Permission)
// - el propio AuthService antes de que exista un tenant resuelto (registro/login)
// Cualquier módulo de negocio tenant-scoped debe usar TenantPrismaService
// (ver tenant-prisma.service.ts), nunca este directamente.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
