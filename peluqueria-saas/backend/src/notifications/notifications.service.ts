import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface NotificationListItem {
  id: string;
  source: 'system' | 'communication';
  type: string;
  title: string;
  body: string;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Centro de notificaciones (Etapa 14, doc `18-NOTIFICACIONES.md`). Singleton
 * sin estado que agrega `tenantId` a mano en cada query — mismo molde que
 * FeatureFlagsService/PlanLimitsService/PlanInfoService, y por el mismo
 * motivo: lo inyectan tanto services request-scoped (Products, Sales) como
 * uno que no lo es (PlanLimitsService, usado desde un Guard), así que no
 * puede depender de TenantPrismaService sin arrastrar el bug de scope
 * documentado en Etapas 2/5/10 — ver tenant-scope.extension.ts.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Comunicaciones (Etapa 3) aplicables a este tenant: audienceType "all",
  // o "plan" con el plan actual del tenant, o "tenants" con este tenant
  // incluido a mano. La comunicación NO se duplica por tenant/usuario —
  // se resuelve en runtime, mismo criterio que la jerarquía de Feature
  // Flags (doc 03 §3).
  private async resolveApplicableCommunications(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado.');
    }

    const or: Prisma.CommunicationWhereInput[] = [
      { audienceType: 'all' },
      { audienceType: 'tenants', tenants: { some: { tenantId } } },
    ];
    if (tenant.planId) {
      or.push({ audienceType: 'plan', planId: tenant.planId });
    }

    return this.prisma.communication.findMany({ where: { OR: or }, orderBy: { createdAt: 'desc' } });
  }

  async list(tenantId: string, userId: string): Promise<NotificationListItem[]> {
    const [notifications, communications, reads] = await Promise.all([
      this.prisma.notification.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' } }),
      this.resolveApplicableCommunications(tenantId),
      this.prisma.communicationRead.findMany({ where: { userId } }),
    ]);
    const readAtByCommunicationId = new Map(reads.map((r) => [r.communicationId, r.readAt]));

    const systemItems: NotificationListItem[] = notifications.map((n) => ({
      id: n.id,
      source: 'system',
      type: n.type,
      title: n.title,
      body: n.body,
      metadata: n.metadata,
      readAt: n.readAt,
      createdAt: n.createdAt,
    }));
    const communicationItems: NotificationListItem[] = communications.map((c) => ({
      id: c.id,
      source: 'communication',
      type: 'communication',
      title: c.title,
      body: c.body,
      metadata: null,
      readAt: readAtByCommunicationId.get(c.id) ?? null,
      createdAt: c.createdAt,
    }));

    return [...systemItems, ...communicationItems].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async unreadCount(tenantId: string, userId: string): Promise<number> {
    const [unreadNotifications, communications, reads] = await Promise.all([
      this.prisma.notification.count({ where: { tenantId, userId, readAt: null } }),
      this.resolveApplicableCommunications(tenantId),
      this.prisma.communicationRead.findMany({ where: { userId } }),
    ]);
    const readCommunicationIds = new Set(reads.map((r) => r.communicationId));
    const unreadCommunications = communications.filter((c) => !readCommunicationIds.has(c.id)).length;
    return unreadNotifications + unreadCommunications;
  }

  async markNotificationRead(tenantId: string, userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification || notification.tenantId !== tenantId || notification.userId !== userId) {
      throw new NotFoundException('Notificación no encontrada.');
    }
    return this.prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  }

  async markCommunicationRead(tenantId: string, userId: string, communicationId: string) {
    const applicable = await this.resolveApplicableCommunications(tenantId);
    if (!applicable.some((c) => c.id === communicationId)) {
      throw new NotFoundException('Comunicación no encontrada.');
    }
    return this.prisma.communicationRead.upsert({
      where: { userId_communicationId: { userId, communicationId } },
      create: { userId, communicationId },
      update: { readAt: new Date() },
    });
  }

  async markAllRead(tenantId: string, userId: string) {
    const [applicable] = await Promise.all([
      this.resolveApplicableCommunications(tenantId),
      this.prisma.notification.updateMany({
        where: { tenantId, userId, readAt: null },
        data: { readAt: new Date() },
      }),
    ]);

    await Promise.all(
      applicable.map((c) =>
        this.prisma.communicationRead.upsert({
          where: { userId_communicationId: { userId, communicationId: c.id } },
          create: { userId, communicationId: c.id },
          update: {},
        }),
      ),
    );
    return { ok: true };
  }

  // Disparador interno usado por otros services (ProductsService, SalesService,
  // PlanLimitsService) para avisar a los usuarios que efectivamente pueden
  // actuar sobre el evento — nunca a todo el negocio a ciegas. Reusa el
  // mismo cruce Permission -> RolePermission -> Role -> UserRole que ya usa
  // PermissionsGuard.
  async notifyUsersWithPermission(
    tenantId: string,
    permissionKey: string,
    type: string,
    title: string,
    body: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        roles: { some: { role: { permissions: { some: { permission: { key: permissionKey } } } } } },
      },
      select: { id: true },
    });
    if (users.length === 0) {
      return;
    }
    await this.prisma.notification.createMany({
      data: users.map((u) => ({ tenantId, userId: u.id, type, title, body, metadata })),
    });
  }
}
