import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';

// PrismaService crudo, con tenantId a mano (igual que NotificationsService,
// Etapa 14): AuditLog no pasa por tenant-scope.extension.ts porque
// también lo escriben acciones de SUPER ADMIN con tenantId null — acá
// SIEMPRE se filtra por el tenant del JWT, nunca por uno que mande el
// cliente.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: ListAuditLogsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.actorType && { actorType: query.actorType }),
      ...(query.action && { action: { contains: query.action } }),
      ...(query.entityType && { entityType: query.entityType }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
