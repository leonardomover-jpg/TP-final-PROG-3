import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';

@Injectable()
export class PlatformAdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAuditLogsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.tenantId && { tenantId: query.tenantId }),
      ...(query.actorType && { actorType: query.actorType }),
      ...(query.action && { action: { contains: query.action } }),
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
