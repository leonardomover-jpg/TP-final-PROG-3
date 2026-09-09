import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

// Observabilidad mínima (Etapa 22, doc `26-AUDITORIA-OBSERVABILIDAD.md`):
// endpoint público sin autenticación (lo pega un monitor de uptime o un
// orquestador, no una persona logueada) que verifica conectividad REAL a
// la base — un "sí, arrancó" sin tocar la DB no sirve para detectar el
// caso más común de negocio caído (Postgres no disponible).
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
    return { status: 'ok', database: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
