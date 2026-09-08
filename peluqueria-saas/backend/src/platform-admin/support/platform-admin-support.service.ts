import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListTicketsQueryDto } from './dto/list-tickets.query.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddTicketMessageDto } from './dto/add-message.dto';

const TICKET_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  tenant: { select: { id: true, name: true, slug: true } },
};

@Injectable()
export class PlatformAdminSupportService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListTicketsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.tenantId && { tenantId: query.tenantId }),
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: TICKET_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: TICKET_INCLUDE,
    });
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado.');
    }
    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto, actingAdminId: string) {
    const ticket = await this.findOne(id);
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.priority && { priority: dto.priority }),
        ...(dto.assignedToAdminId !== undefined && { assignedToAdminId: dto.assignedToAdminId }),
      },
      include: TICKET_INCLUDE,
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: ticket.tenantId,
        actorType: 'platform_admin',
        actorId: actingAdminId,
        action: 'support_ticket.updated',
        entityType: 'SupportTicket',
        entityId: id,
        beforeData: { status: ticket.status, priority: ticket.priority },
        afterData: { status: updated.status, priority: updated.priority },
      },
    });
    return updated;
  }

  async addMessage(id: string, dto: AddTicketMessageDto, actingAdminId: string) {
    await this.findOne(id); // 404 si no existe
    await this.prisma.supportTicketMessage.create({
      data: { ticketId: id, authorType: 'platform_admin', authorId: actingAdminId, body: dto.body },
    });
    return this.findOne(id);
  }
}
