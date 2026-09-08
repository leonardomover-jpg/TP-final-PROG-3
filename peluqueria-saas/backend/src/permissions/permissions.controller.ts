import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

// Catálogo global de permisos (no es tenant-scoped: es el mismo para toda
// la plataforma, lo crea el código, no el negocio — doc 02 §6.4).
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('roles.ver')
  @Get()
  findAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });
  }
}
