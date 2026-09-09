import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.tenantPrisma.client.supplier.findUnique({ where: { id } });
    if (!supplier || supplier.deletedAt) {
      throw new NotFoundException('Proveedor no encontrado.');
    }
    return supplier;
  }

  create(dto: CreateSupplierDto) {
    return this.tenantPrisma.client.supplier.create({
      data: {
        tenantId: this.tenantPrisma.tenantId,
        name: dto.name,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
        status: dto.status ?? 'active',
      },
    });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    const data: Prisma.SupplierUpdateInput = {
      ...(dto.name && { name: dto.name }),
      ...(dto.contactName !== undefined && { contactName: dto.contactName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.status && { status: dto.status }),
    };
    return this.tenantPrisma.client.supplier.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.tenantPrisma.client.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
    });
  }
}
