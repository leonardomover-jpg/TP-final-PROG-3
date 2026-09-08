import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const ROLE_INCLUDE = { permissions: { include: { permission: true } } } as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.tenantPrisma.client.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  // findUnique no está interceptado por el extension de tenant (ver
  // tenant-scope.extension.ts) porque un rol de sistema (tenantId null)
  // también debe poder leerse por id. La pertenencia se valida acá.
  async findOne(id: string) {
    const role = await this.tenantPrisma.client.role.findUnique({
      where: { id },
      include: ROLE_INCLUDE,
    });
    if (!role || (role.tenantId !== null && role.tenantId !== this.tenantPrisma.tenantId)) {
      throw new NotFoundException('Rol no encontrado.');
    }
    return role;
  }

  private async resolvePermissionIds(permissionKeys: string[]) {
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });
    if (permissions.length !== permissionKeys.length) {
      throw new BadRequestException('Alguno de los permisos indicados no existe.');
    }
    return permissions.map((p) => p.id);
  }

  async create(dto: CreateRoleDto) {
    const permissionIds = await this.resolvePermissionIds(dto.permissionKeys);
    return this.tenantPrisma.client.role.create({
      data: {
        name: dto.name,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: ROLE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw new ForbiddenException('Los roles de sistema no se pueden modificar.');
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      if (dto.permissionKeys) {
        const permissionIds = await this.resolvePermissionIds(dto.permissionKeys);
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
      return tx.role.update({
        where: { id },
        data: { ...(dto.name && { name: dto.name }) },
        include: ROLE_INCLUDE,
      });
    });
  }

  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw new ForbiddenException('Los roles de sistema no se pueden eliminar.');
    }
    // El extension ya fuerza tenantId=actual en delete (ver
    // tenant-scope.extension.ts), así que esto es una segunda barrera, no
    // la única: aunque `isSystem` estuviera mal seteado, la igualdad de
    // tenantId nunca matchea contra un tenantId null.
    return this.tenantPrisma.client.role.delete({ where: { id } });
  }
}
