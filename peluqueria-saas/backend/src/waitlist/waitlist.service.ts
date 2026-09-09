import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { ListWaitlistQueryDto } from './dto/list-waitlist.query.dto';

/**
 * Lista de espera (Etapa 10): una cola visible que el negocio gestiona a
 * mano cuando un cliente quiere un turno y no hay disponibilidad en la
 * fecha que prefiere. Sin motor de "auto-oferta" al liberarse un lugar —
 * eso es Notificaciones (Etapa 14), doc `14-AGENDA-TURNOS.md` §7.
 */
@Injectable()
export class WaitlistService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll(query: ListWaitlistQueryDto) {
    return this.tenantPrisma.client.waitlistEntry.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.clientId && { clientId: query.clientId }),
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateWaitlistEntryDto) {
    const [client, service] = await Promise.all([
      this.tenantPrisma.client.client.findUnique({ where: { id: dto.clientId } }),
      this.tenantPrisma.client.service.findUnique({ where: { id: dto.serviceId } }),
    ]);
    if (!client || client.deletedAt) {
      throw new BadRequestException('El cliente indicado no existe en este negocio.');
    }
    if (!service || service.deletedAt) {
      throw new BadRequestException('El servicio indicado no existe en este negocio.');
    }
    if (dto.branchId) {
      const branch = await this.tenantPrisma.client.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch || branch.deletedAt) {
        throw new BadRequestException('La sucursal indicada no existe en este negocio.');
      }
    }
    if (dto.professionalId) {
      const professional = await this.tenantPrisma.client.professional.findUnique({
        where: { id: dto.professionalId },
      });
      if (!professional || professional.deletedAt) {
        throw new BadRequestException('El profesional indicado no existe en este negocio.');
      }
    }

    return this.tenantPrisma.client.waitlistEntry.create({
      data: {
        tenantId: this.tenantPrisma.tenantId,
        branchId: dto.branchId,
        professionalId: dto.professionalId,
        clientId: dto.clientId,
        serviceId: dto.serviceId,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : undefined,
        notes: dto.notes,
      },
    });
  }

  // Baja definitiva (no soft delete, a diferencia de los modelos de
  // negocio principales): una entrada de lista de espera es una cola de
  // trabajo, no un registro con valor histórico que conservar.
  async remove(id: string) {
    const entry = await this.tenantPrisma.client.waitlistEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Entrada de lista de espera no encontrada.');
    }
    await this.tenantPrisma.client.waitlistEntry.delete({ where: { id } });
  }
}
