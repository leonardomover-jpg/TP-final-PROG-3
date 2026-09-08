import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Nunca se devuelve passwordHash/mfaSecret en una respuesta de API, ni por
// accidente (doc 04-SEGURIDAD-BASELINE §3).
const SAFE_USER_SELECT = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  mfaEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.user.findMany({
      where: { deletedAt: null },
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.tenantPrisma.client.user.findUnique({
      where: { id },
      select: { ...SAFE_USER_SELECT, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    const { deletedAt: _deletedAt, ...safeUser } = user;
    return safeUser;
  }

  async create(dto: CreateUserDto) {
    const [branches, roles] = await Promise.all([
      this.tenantPrisma.client.branch.findMany({ where: { id: { in: dto.branchIds } } }),
      this.tenantPrisma.client.role.findMany({ where: { id: { in: dto.roleIds } } }),
    ]);
    if (branches.length !== dto.branchIds.length) {
      throw new BadRequestException('Alguna de las sucursales indicadas no existe.');
    }
    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException('Alguno de los roles indicados no existe.');
    }

    const passwordHash = await argon2.hash(dto.password);
    try {
      return await this.tenantPrisma.client.user.create({
        data: {
          // tenantId también lo inyecta la extensión (tenant-scope.extension.ts),
          // pero acá se pasa explícito porque `this.tenantPrisma.tenantId` sale
          // del JWT verificado, no del body del request: no es "confiar en el
          // cliente", es el mismo valor de confianza, solo que tipado sin fricción.
          tenantId: this.tenantPrisma.tenantId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          branches: { create: dto.branchIds.map((branchId) => ({ branchId })) },
          roles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
        },
        select: SAFE_USER_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email en este negocio.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const data: Prisma.UserUpdateInput = {
      ...(dto.firstName && { firstName: dto.firstName }),
      ...(dto.lastName && { lastName: dto.lastName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.status && { status: dto.status }),
    };
    if (dto.password) {
      data.passwordHash = await argon2.hash(dto.password);
    }

    return this.tenantPrisma.client.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });
  }

  // Soft delete (punto 97 del pedido): se conserva el historial, se corta el
  // acceso. `deletedAt` + `status: suspended` para que JwtStrategy también
  // rechace cualquier sesión ya emitida.
  async remove(id: string) {
    await this.findOne(id);
    return this.tenantPrisma.client.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'suspended' },
      select: SAFE_USER_SELECT,
    });
  }
}
