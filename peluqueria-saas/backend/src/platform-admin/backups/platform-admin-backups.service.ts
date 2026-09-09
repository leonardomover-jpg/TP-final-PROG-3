import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createDump, computeSha256, verifyByRestore } from './backup-runner';
import { ListBackupsQueryDto } from './dto/list-backups.query.dto';

/**
 * Backups de TODA la base (Etapa 24, doc `28-BACKUPS.md`) — mismo
 * criterio que el resto de `platform-admin/*`: `PrismaService` crudo, sin
 * `TenantPrismaService`, porque un dump cubre todos los tenants a la vez
 * (no hay "tenant actual" al que acotar nada acá).
 *
 * "Automatización" (punto del roadmap) sin inventar una capa de Jobs en
 * background que todavía no existe en este proyecto (mismo motivo de
 * restricción documentado desde Etapas 16/17 para recordatorios de
 * WhatsApp): `run()` es el mismo método que llama tanto el endpoint
 * manual (`POST /platform-admin/backups/run`) como
 * `scripts/run-backup.ts`, invocable por un cron del sistema operativo o
 * de la plataforma de deploy — el "cuándo" se agenda afuera, "qué hacer"
 * está acá, ya probado.
 */
@Injectable()
export class PlatformAdminBackupsService {
  constructor(private readonly prisma: PrismaService) {}

  private get backupDir(): string {
    return process.env.BACKUP_DIR || './backups';
  }

  private get databaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new InternalServerErrorException('DATABASE_URL no está configurada en este ambiente.');
    }
    return url;
  }

  async run() {
    const backup = await this.prisma.backup.create({
      data: { filename: '', sizeBytes: 0, checksumSha256: '', status: 'pending' },
    });

    let filePath: string;
    let sizeBytes: number;
    try {
      const dump = await createDump(this.databaseUrl, this.backupDir);
      filePath = dump.filePath;
      sizeBytes = dump.sizeBytes;
    } catch (error) {
      await this.prisma.backup.update({
        where: { id: backup.id },
        data: { status: 'failed', errorMessage: this.errorMessage(error), completedAt: new Date() },
      });
      throw error;
    }

    const checksumSha256 = await computeSha256(filePath);
    await this.prisma.backup.update({
      where: { id: backup.id },
      data: {
        filename: filePath.split('/').pop()!,
        sizeBytes,
        checksumSha256,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    // Verificación por restauración REAL (nunca solo "se generó el
    // archivo") — un dump corrupto o un backup que no restaura de
    // verdad no sirve de nada el día que hace falta usarlo.
    try {
      const verification = await verifyByRestore(this.databaseUrl, filePath);
      await this.prisma.backup.update({
        where: { id: backup.id },
        data: {
          status: verification.ok ? 'verified' : 'verification_failed',
          errorMessage: verification.ok ? null : verification.detail,
          verifiedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.backup.update({
        where: { id: backup.id },
        data: { status: 'verification_failed', errorMessage: this.errorMessage(error), verifiedAt: new Date() },
      });
    }

    return this.findOne(backup.id);
  }

  async findAll(query: ListBackupsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await Promise.all([
      this.prisma.backup.findMany({
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.backup.count(),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      throw new NotFoundException('Backup no encontrado.');
    }
    return backup;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
