import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants.query.dto';

// Este service es el ÚNICO lugar del backend, junto con el resto de
// platform-admin/*, donde es correcto usar PrismaService crudo (sin
// TenantPrismaService) para leer/escribir Tenant a través de múltiples
// negocios a la vez — es exactamente lo que SUPER ADMIN necesita poder
// hacer. Ningún otro módulo debe replicar este patrón.
@Injectable()
export class PlatformAdminTenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListTenantsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.TenantWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: { plan: true, subscription: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { plan: true, subscription: true, branches: true },
    });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }
    return tenant;
  }

  async create(dto: CreateTenantDto, actingAdminId: string) {
    const existingSlug = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existingSlug) {
      throw new ConflictException('Ese identificador de negocio ya está en uso.');
    }
    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) {
        throw new BadRequestException('El plan indicado no existe.');
      }
    }
    const adminRole = await this.prisma.role.findFirst({
      where: { isSystem: true, name: 'Administrador del negocio' },
    });
    if (!adminRole) {
      throw new ConflictException('La plataforma todavía no tiene los roles de sistema inicializados.');
    }

    const passwordHash = await argon2.hash(dto.adminPassword);

    const { tenant } = await this.prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: { name: dto.businessName, slug: dto.slug, planId: dto.planId },
      });
      const mainBranch = await tx.branch.create({
        data: { tenantId: createdTenant.id, name: 'Casa Central', isMain: true },
      });
      const adminUser = await tx.user.create({
        data: {
          tenantId: createdTenant.id,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          email: dto.adminEmail,
          passwordHash,
          branches: { create: [{ branchId: mainBranch.id }] },
          roles: { create: [{ roleId: adminRole.id }] },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: createdTenant.id,
          actorType: 'platform_admin',
          actorId: actingAdminId,
          action: 'tenant.created_by_platform_admin',
          entityType: 'Tenant',
          entityId: createdTenant.id,
        },
      });
      return { tenant: createdTenant, adminUser };
    });

    return tenant;
  }

  private async changeStatus(
    id: string,
    newStatus: 'active' | 'suspended' | 'cancelled',
    action: string,
    actingAdminId: string,
  ) {
    const tenant = await this.findOne(id);
    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status: newStatus },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: id,
        actorType: 'platform_admin',
        actorId: actingAdminId,
        action,
        entityType: 'Tenant',
        entityId: id,
        beforeData: { status: tenant.status },
        afterData: { status: newStatus },
      },
    });
    return updated;
  }

  async assignPlan(id: string, planId: string, actingAdminId: string) {
    const tenant = await this.findOne(id);
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new BadRequestException('El plan indicado no existe.');
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { planId },
      include: { plan: true },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: id,
        actorType: 'platform_admin',
        actorId: actingAdminId,
        action: 'tenant.plan_changed',
        entityType: 'Tenant',
        entityId: id,
        beforeData: { planId: tenant.planId },
        afterData: { planId },
      },
    });
    return updated;
  }

  suspend(id: string, actingAdminId: string) {
    return this.changeStatus(id, 'suspended', 'tenant.suspended', actingAdminId);
  }

  reactivate(id: string, actingAdminId: string) {
    return this.changeStatus(id, 'active', 'tenant.reactivated', actingAdminId);
  }

  cancel(id: string, actingAdminId: string) {
    return this.changeStatus(id, 'cancelled', 'tenant.cancelled', actingAdminId);
  }
}
