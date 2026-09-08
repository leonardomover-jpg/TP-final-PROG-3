import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';

const TICKET_INCLUDE = { messages: { orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class SupportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    // SupportTicketMessage no tiene tenantId propio (es una tabla puente,
    // igual que UserBranch/RolePermission — ver doc 02 §6): su aislamiento
    // se garantiza validando el ticket padre con el cliente tenant-scoped
    // ANTES de tocar esta tabla con el cliente crudo.
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.tenantPrisma.client.supportTicket.findMany({
      include: TICKET_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const ticket = await this.tenantPrisma.client.supportTicket.findUnique({
      where: { id },
      include: TICKET_INCLUDE,
    });
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado.');
    }
    return ticket;
  }

  create(dto: CreateTicketDto, userId: string) {
    // tenantId explícito: sale de this.tenantPrisma.tenantId (derivado del
    // JWT verificado, no del body) — mismo patrón que UsersService.create.
    return this.tenantPrisma.client.supportTicket.create({
      data: {
        tenantId: this.tenantPrisma.tenantId,
        subject: dto.subject,
        priority: dto.priority ?? 'medium',
        createdByUserId: userId,
        messages: { create: [{ authorType: 'user', authorId: userId, body: dto.body }] },
      },
      include: TICKET_INCLUDE,
    });
  }

  async addMessage(ticketId: string, dto: CreateMessageDto, userId: string) {
    await this.findOne(ticketId); // valida que el ticket sea del tenant actual
    await this.prisma.supportTicketMessage.create({
      data: { ticketId, authorType: 'user', authorId: userId, body: dto.body },
    });
    return this.findOne(ticketId);
  }
}
