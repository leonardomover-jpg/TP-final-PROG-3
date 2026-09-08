import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { SetScheduleDto } from './dto/set-schedule.dto';

const PROFESSIONAL_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  specialties: true,
  commissionPercentage: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProfessionalSelect;

@Injectable()
export class ProfessionalsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.professional.findMany({
      where: { deletedAt: null },
      select: PROFESSIONAL_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const professional = await this.tenantPrisma.client.professional.findUnique({
      where: { id },
      select: {
        ...PROFESSIONAL_SELECT,
        deletedAt: true,
        schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    });
    if (!professional || professional.deletedAt) {
      throw new NotFoundException('Profesional no encontrado.');
    }
    const { deletedAt: _deletedAt, ...safeProfessional } = professional;
    return safeProfessional;
  }

  private async assertExists(id: string): Promise<void> {
    const professional = await this.tenantPrisma.client.professional.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!professional || professional.deletedAt) {
      throw new NotFoundException('Profesional no encontrado.');
    }
  }

  // El User a vincular tiene que pertenecer al mismo tenant (ya lo garantiza
  // buscar con tenantPrisma.client.user, filtrado por la extensión) y no
  // estar ya vinculado a otro profesional (userId es @unique en el schema,
  // pero se valida antes para devolver un mensaje claro en vez de un 500 por
  // constraint).
  private async assertUserLinkable(userId: string, excludeProfessionalId?: string): Promise<void> {
    const user = await this.tenantPrisma.client.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('El usuario indicado no existe en este negocio.');
    }
    const alreadyLinked = await this.tenantPrisma.client.professional.findFirst({
      where: { userId, deletedAt: null, ...(excludeProfessionalId && { id: { not: excludeProfessionalId } }) },
    });
    if (alreadyLinked) {
      throw new ConflictException('Ese usuario ya está vinculado a otro profesional.');
    }
  }

  async create(dto: CreateProfessionalDto) {
    if (dto.userId) {
      await this.assertUserLinkable(dto.userId);
    }

    return this.tenantPrisma.client.professional.create({
      data: {
        // tenantId también lo inyecta tenant-scope.extension.ts, se pasa
        // explícito por el mismo motivo documentado en UsersService.create.
        tenantId: this.tenantPrisma.tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email,
        specialties: dto.specialties ?? [],
        commissionPercentage: dto.commissionPercentage,
        userId: dto.userId,
        status: dto.status ?? 'active',
      },
      select: PROFESSIONAL_SELECT,
    });
  }

  async update(id: string, dto: UpdateProfessionalDto) {
    await this.assertExists(id);

    if (dto.userId) {
      await this.assertUserLinkable(dto.userId, id);
    }

    const data: Prisma.ProfessionalUpdateInput = {
      ...(dto.firstName && { firstName: dto.firstName }),
      ...(dto.lastName && { lastName: dto.lastName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.specialties !== undefined && { specialties: dto.specialties }),
      ...(dto.commissionPercentage !== undefined && { commissionPercentage: dto.commissionPercentage }),
      ...(dto.status && { status: dto.status }),
      // userId puede venir como string (vincular/cambiar), null (desvincular
      // explícitamente) o undefined (no tocar) — se distingue con 'in dto'
      // porque `null` y "no enviado" son casos distintos acá.
      ...('userId' in dto && { user: dto.userId ? { connect: { id: dto.userId } } : { disconnect: true } }),
    };

    return this.tenantPrisma.client.professional.update({
      where: { id },
      data,
      select: PROFESSIONAL_SELECT,
    });
  }

  // Soft delete (mismo patrón que Client/User/Branch, punto 97 del pedido):
  // se conserva el historial (turnos/ventas/comisiones futuros siguen
  // apuntando a este Professional), se saca de las listas activas.
  async remove(id: string) {
    await this.assertExists(id);
    return this.tenantPrisma.client.professional.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
      select: PROFESSIONAL_SELECT,
    });
  }

  // Reemplaza el horario semanal completo del profesional (ver comentario
  // en set-schedule.dto.ts). No hay validación de superposición entre
  // rangos a propósito en esta etapa: el motor de disponibilidad real
  // (que sí necesita detectarla para no ofrecer turnos imposibles) es la
  // Etapa 10 — acá es solo el dato de "en qué franjas trabaja".
  async setSchedule(professionalId: string, dto: SetScheduleDto) {
    await this.assertExists(professionalId);

    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.professionalSchedule.deleteMany({ where: { professionalId } }),
      this.tenantPrisma.client.professionalSchedule.createMany({
        data: dto.entries.map((entry) => ({
          professionalId,
          dayOfWeek: entry.dayOfWeek,
          startTime: entry.startTime,
          endTime: entry.endTime,
        })),
      }),
    ]);

    return this.tenantPrisma.client.professionalSchedule.findMany({
      where: { professionalId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }
}
