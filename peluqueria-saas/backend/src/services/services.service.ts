import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { SetProfessionalsDto } from './dto/set-professionals.dto';

const SERVICE_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  category: true,
  durationMinutes: true,
  price: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceSelect;

@Injectable()
export class ServicesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.service.findMany({
      where: { deletedAt: null },
      select: SERVICE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Ficha del servicio: datos + profesionales habilitados (con sus datos
  // básicos, no solo el id, para no obligar al frontend a otro round-trip).
  async findOne(id: string) {
    const service = await this.tenantPrisma.client.service.findUnique({
      where: { id },
      select: {
        ...SERVICE_SELECT,
        deletedAt: true,
        professionals: {
          select: {
            professional: {
              select: { id: true, firstName: true, lastName: true, status: true },
            },
          },
        },
      },
    });
    if (!service || service.deletedAt) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    const { deletedAt: _deletedAt, professionals, ...safeService } = service;
    return { ...safeService, professionals: professionals.map((sp) => sp.professional) };
  }

  private async assertExists(id: string): Promise<void> {
    const service = await this.tenantPrisma.client.service.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!service || service.deletedAt) {
      throw new NotFoundException('Servicio no encontrado.');
    }
  }

  async create(dto: CreateServiceDto) {
    return this.tenantPrisma.client.service.create({
      data: {
        // tenantId también lo inyecta tenant-scope.extension.ts, se pasa
        // explícito por el mismo motivo documentado en UsersService.create.
        tenantId: this.tenantPrisma.tenantId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        durationMinutes: dto.durationMinutes,
        price: dto.price,
        status: dto.status ?? 'active',
      },
      select: SERVICE_SELECT,
    });
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.assertExists(id);

    const data: Prisma.ServiceUpdateInput = {
      ...(dto.name && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.durationMinutes !== undefined && { durationMinutes: dto.durationMinutes }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.status && { status: dto.status }),
    };

    return this.tenantPrisma.client.service.update({
      where: { id },
      data,
      select: SERVICE_SELECT,
    });
  }

  // Soft delete (mismo patrón que Client/Professional/User/Branch, punto 97
  // del pedido): se conserva el historial (turnos/ventas futuros siguen
  // apuntando a este Service), se saca de las listas activas.
  async remove(id: string) {
    await this.assertExists(id);
    return this.tenantPrisma.client.service.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
      select: SERVICE_SELECT,
    });
  }

  // Reemplaza la lista completa de profesionales habilitados. Valida que
  // CADA professionalId pertenezca al tenant actual (vía el cliente
  // tenant-scoped, que ya filtra) antes de escribir el vínculo — un id de
  // otro tenant simplemente no aparece en `existing` y dispara el 400.
  async setProfessionals(serviceId: string, dto: SetProfessionalsDto) {
    await this.assertExists(serviceId);

    const uniqueIds = [...new Set(dto.professionalIds)];
    if (uniqueIds.length > 0) {
      const existing = await this.tenantPrisma.client.professional.findMany({
        where: { id: { in: uniqueIds }, deletedAt: null },
        select: { id: true },
      });
      if (existing.length !== uniqueIds.length) {
        throw new BadRequestException('Alguno de los profesionales indicados no existe en este negocio.');
      }
    }

    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.serviceProfessional.deleteMany({ where: { serviceId } }),
      this.tenantPrisma.client.serviceProfessional.createMany({
        data: uniqueIds.map((professionalId) => ({ serviceId, professionalId })),
      }),
    ]);

    const professionals = await this.tenantPrisma.client.serviceProfessional.findMany({
      where: { serviceId },
      select: { professional: { select: { id: true, firstName: true, lastName: true, status: true } } },
    });
    return professionals.map((sp) => sp.professional);
  }
}
