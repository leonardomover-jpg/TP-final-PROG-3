import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { ListCommunicationsQueryDto } from './dto/list-communications.query.dto';

// Solo cubre creación + listado (lado SUPER ADMIN). El consumo del lado
// negocio (que un usuario del tenant vea la comunicación en su centro de
// notificaciones) se implementa en la Etapa 14 (Notificaciones) del
// roadmap — acá se sienta el modelo de datos y quién puede emitir qué,
// que es lo que le corresponde a esta etapa.
@Injectable()
export class PlatformAdminCommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListCommunicationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.prisma.communication.findMany({
        include: { plan: true, tenants: { include: { tenant: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.communication.count(),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(dto: CreateCommunicationDto, actingAdminId: string) {
    if (dto.audienceType === 'plan') {
      if (!dto.planId) {
        throw new BadRequestException('Falta indicar el plan para este tipo de audiencia.');
      }
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) {
        throw new BadRequestException('El plan indicado no existe.');
      }
    }

    if (dto.audienceType === 'tenants') {
      if (!dto.tenantIds || dto.tenantIds.length === 0) {
        throw new BadRequestException('Falta indicar al menos un negocio para este tipo de audiencia.');
      }
      const foundTenants = await this.prisma.tenant.findMany({
        where: { id: { in: dto.tenantIds } },
      });
      if (foundTenants.length !== dto.tenantIds.length) {
        throw new BadRequestException('Alguno de los negocios indicados no existe.');
      }
    }

    const communication = await this.prisma.communication.create({
      data: {
        title: dto.title,
        body: dto.body,
        audienceType: dto.audienceType,
        planId: dto.audienceType === 'plan' ? dto.planId : null,
        createdByAdminId: actingAdminId,
        tenants:
          dto.audienceType === 'tenants'
            ? { create: (dto.tenantIds ?? []).map((tenantId) => ({ tenantId })) }
            : undefined,
      },
      include: { plan: true, tenants: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: null,
        actorType: 'platform_admin',
        actorId: actingAdminId,
        action: 'communication.created',
        entityType: 'Communication',
        entityId: communication.id,
        afterData: { title: dto.title, audienceType: dto.audienceType },
      },
    });

    return communication;
  }
}
