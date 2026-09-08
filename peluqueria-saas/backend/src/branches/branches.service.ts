import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

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
    const branch = await this.tenantPrisma.client.branch.findUnique({ where: { id } });
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
}
