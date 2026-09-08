import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions.query.dto';

@Injectable()
export class PlatformAdminSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListSubscriptionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: { tenant: { select: { id: true, name: true, slug: true } }, plan: true },
        orderBy: { currentPeriodEnd: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        plan: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!subscription) {
      throw new NotFoundException('Suscripción no encontrada.');
    }
    return subscription;
  }
}
