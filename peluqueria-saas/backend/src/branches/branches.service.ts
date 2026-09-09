import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { SetScheduleDto } from '../common/dto/set-schedule.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.branch.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const branch = await this.tenantPrisma.client.branch.findUnique({
      where: { id },
      include: { schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } },
    });
    if (!branch || branch.deletedAt) {
      throw new NotFoundException('Sucursal no encontrada.');
    }
    return branch;
  }

  create(dto: CreateBranchDto) {
    // tenantId explícito por la misma razón que en UsersService.create: sale
    // del JWT verificado (this.tenantPrisma.tenantId), no del body.
    return this.tenantPrisma.client.branch.create({
      data: { tenantId: this.tenantPrisma.tenantId, name: dto.name, address: dto.address },
    });
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.branch.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.status && { status: dto.status }),
      },
    });
  }

  async remove(id: string) {
    const branch = await this.findOne(id);
    if (branch.isMain) {
      throw new BadRequestException('La sucursal principal no se puede eliminar.');
    }
    return this.tenantPrisma.client.branch.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
    });
  }

  // Reemplaza el horario semanal completo de la sucursal — mismo patrón que
  // ProfessionalSchedule (Etapa 7, doc `11` §3): deleteMany + createMany en
  // una transacción, sin validar superposición de rangos todavía (eso es
  // del motor de disponibilidad real, Etapa 10).
  async setSchedule(branchId: string, dto: SetScheduleDto) {
    await this.findOne(branchId);

    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.branchSchedule.deleteMany({ where: { branchId } }),
      this.tenantPrisma.client.branchSchedule.createMany({
        data: dto.entries.map((entry) => ({
          branchId,
          dayOfWeek: entry.dayOfWeek,
          startTime: entry.startTime,
          endTime: entry.endTime,
        })),
      }),
    ]);

    return this.tenantPrisma.client.branchSchedule.findMany({
      where: { branchId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }
}
