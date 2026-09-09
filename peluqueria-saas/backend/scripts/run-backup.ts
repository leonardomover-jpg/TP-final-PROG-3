// Punto de entrada para automatizar backups (Etapa 24, doc
// `28-BACKUPS.md` §4) sin una capa de Jobs en background que todavía no
// existe en este proyecto: un cron del sistema operativo (o del
// orquestador de deploy) apunta a `npm run backup:run`, que arranca un
// contexto de Nest sin HTTP, corre exactamente el mismo
// `PlatformAdminBackupsService.run()` que usa el endpoint manual
// (`POST /platform-admin/backups/run`), y termina el proceso.
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PlatformAdminBackupsService } from '../src/platform-admin/backups/platform-admin-backups.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const backupsService = app.get(PlatformAdminBackupsService);
    const backup = await backupsService.run();
    // eslint-disable-next-line no-console
    console.log(`Backup ${backup.id}: ${backup.status} (${backup.filename}, ${backup.sizeBytes} bytes)`);
    if (backup.status !== 'verified') {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Backup falló:', error);
  process.exit(1);
});
