# 28 — Backups (Etapa 24)

## 1. Qué pide esta etapa

Doc `06-ROADMAP-ETAPAS.md`: "automatización, verificación por
restauración real (no solo 'se generó el archivo'), registro de
backups."

## 2. Por qué es un `model Backup` a nivel plataforma, no por-tenant

Un `pg_dump` cubre toda la base de una sola vez — no existe (ni tendría
sentido operativo) un dump por tenant. `Backup` no tiene `tenantId`,
igual que `PlatformAdmin`/`Plan`/`FeatureFlag`: se administra desde
`platform-admin/*`, con `PrismaService` crudo (mismo criterio que el
resto de los services de esa carpeta).

## 3. `backup-runner.ts`: funciones puras, sin estado

Mismo patrón que `mercado-pago-client.ts`/`whatsapp-client.ts`/
`meta-client.ts`/`ai-client.ts`: funciones parametrizadas explícitamente
(nunca leen `process.env` por su cuenta), fáciles de invocar desde el
service o desde el script de automatización por igual.

- `createDump(databaseUrl, outputDir)`: corre `pg_dump` real con
  `child_process.execFile` — **siempre con los argumentos como array**,
  nunca un string armado por interpolación (misma disciplina que el
  resto del proyecto, aunque acá ningún input viene de un cliente HTTP:
  son el propio `DATABASE_URL` del servidor y paths generados en el
  mismo código).
- `computeSha256(filePath)`: hashea el archivo en streaming (no lo carga
  entero en memoria).
- `verifyByRestore(sourceDatabaseUrl, dumpFilePath)`: la parte que
  cumple el "no solo 'se generó el archivo'" del roadmap — ver §4.

## 4. Verificación REAL por restauración, no un chequeo de existencia

`verifyByRestore` hace, en este orden:

1. Cuenta filas en `Tenant` y `User` en la base ORIGEN.
2. Crea una base Postgres nueva y descartable (`createdb`,
   `backup_verify_<timestamp>_<random>`).
3. Restaura el dump ahí adentro con `psql --file <dump> --set
   ON_ERROR_STOP=1` (si el dump está corrupto o incompleto, esto falla
   ahí mismo).
4. Cuenta las mismas filas en la base restaurada y compara contra el
   origen.
5. Borra la base temporal **en un `finally`**, pase lo que pase (éxito,
   mismatch, o excepción a mitad de camino) — nunca queda una base de
   verificación colgada.

Esto se probó de punta a punta contra la base real de este proyecto
antes de escribir el service que lo usa: dump real de ~5.5 MB, checksum
válido, restauración exitosa, conteos de `Tenant`/`User` coincidentes
entre origen y restaurado. `test/backups.spec.ts` corre exactamente este
mismo flujo (sin mocks — usa Postgres real) en cada corrida de la suite,
y además verifica explícitamente que no quede ninguna base
`backup_verify_%` colgada al terminar.

`SANITY_CHECK_TABLES = ['Tenant', 'User']`: no hace falta comparar las
50+ tablas del sistema para probar que un dump restaura de verdad —
alcanza con una muestra que cubra el nivel plataforma (`Tenant`) y el
nivel negocio (`User`).

## 5. `PlatformAdminBackupsService.run()`: un solo flujo, dos invocadores

`run()` hace `pending` → `pg_dump` → checksum → `completed` →
verificación por restauración → `verified` o `verification_failed`,
actualizando la fila `Backup` en cada paso (incluyendo `errorMessage` si
algo falla en el medio, para poder diagnosticar sin mirar logs). Es el
mismo método que llaman:

- `POST /platform-admin/backups/run` (manual, SUPER ADMIN, síncrono — un
  dump + verificación de la base de este proyecto tarda segundos).
- `scripts/run-backup.ts` (`npm run backup:run`): levanta un contexto de
  Nest sin HTTP vía `NestFactory.createApplicationContext(AppModule)`,
  corre `run()`, imprime el resultado y termina con `exitCode = 1` si el
  backup no quedó `verified`. Pensado para que lo invoque un cron del
  sistema operativo o de la plataforma de deploy — el "cuándo" se agenda
  afuera (ver §6), acá está el "qué hacer", ya probado.

`GET /platform-admin/backups` (paginado) y `GET
/platform-admin/backups/:id` completan el registro/consulta pedido por
el roadmap.

`BACKUP_DIR` (`.env`, opcional, default `./backups`): dónde se escriben
los dumps. Ese directorio nunca va al repo (`.gitignore` raíz) — son
datos reales de producción.

## 6. Qué NO se hizo en esta etapa (a propósito)

- **Un scheduler/cron real dentro de la aplicación**: mismo criterio de
  restricción documentado desde las Etapas 16/17 para recordatorios de
  WhatsApp ("no hay capa de Jobs en background todavía") — inventar un
  scheduler en proceso solo para esta etapa habría sido una solución a
  medias (se pierde si el proceso se reinicia, no coordina con múltiples
  instancias). `scripts/run-backup.ts` es el punto de entrada correcto
  para que la infraestructura de deploy (cron del SO, scheduled job de
  la plataforma de hosting) dispare backups periódicos — la
  automatización real, sin inventar una capa nueva a medio hacer.
- **Subida a almacenamiento externo (S3 u otro)**: el roadmap pide
  automatización + verificación + registro, no un destino de
  almacenamiento remoto específico; `BACKUP_DIR` queda como un directorio
  configurable, listo para apuntar a un volumen montado o, en una etapa
  posterior, extenderse con un paso de subida.
- **Restauración real de producción (`pg_restore` sobre la base
  origen)**: fuera de alcance y deliberadamente peligroso de automatizar
  — la verificación restaura a una base DESCARTABLE, nunca sobre la real.
- **Purga/rotación automática de backups viejos**: no pedida por el
  roadmap; se puede agregar después sin tocar lo ya construido (un campo
  más de configuración + un paso extra en `run()` o un script aparte).

## 7. Tests

`test/backups.spec.ts` (5 tests, nuevos): un SUPER ADMIN corre un backup
real de punta a punta (dump real + checksum verificado contra el
archivo en disco + verificación por restauración real, sin ninguna base
`backup_verify_%` colgada al final); listado paginado; detalle por id;
404 con id inexistente; los tres endpoints devuelven 401 sin token de
SUPER ADMIN. 215 tests en la suite completa (5 nuevos).
