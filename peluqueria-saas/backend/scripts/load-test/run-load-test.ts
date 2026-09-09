// Load test de escalabilidad multi-tenant (Etapa 25, doc `29-TESTING-CARGA.md`):
// "¿leer los datos de UN negocio se vuelve más lento a medida que la
// plataforma tiene más y más negocios?" — la pregunta real detrás del
// "10 → 10.000 negocios simulados" del roadmap.
//
// Corre contra una base Postgres DESCARTABLE (mismo patrón que
// `backup-runner.ts` verifyByRestore, Etapa 24): nunca toca la base de
// dev/test compartida — poblarla con 10.000 tenants sintéticos la
// dejaría permanentemente más lenta para todas las etapas siguientes.
// La base descartable se borra siempre en el `finally`, haya éxito o error.
//
// Uso: npm run loadtest:run
//      LOAD_TEST_CHECKPOINTS="10,100" npm run loadtest:run   (corrida rápida)
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { PrismaClient } from '@prisma/client';

const execFileAsync = promisify(execFile);

const CHECKPOINTS = (process.env.LOAD_TEST_CHECKPOINTS ?? '10,100,1000,10000')
  .split(',')
  .map((n) => parseInt(n.trim(), 10));
const CLIENTS_PER_TENANT = 20;
const SAMPLES_PER_CHECKPOINT = 200;
const INSERT_BATCH_SIZE = 500;

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function growTenants(prisma: PrismaClient, fromCount: number, toCount: number) {
  for (let start = fromCount; start < toCount; start += INSERT_BATCH_SIZE) {
    const batchSize = Math.min(INSERT_BATCH_SIZE, toCount - start);
    const tenants = Array.from({ length: batchSize }, (_, i) => ({
      id: randomUUID(),
      name: `Negocio simulado ${start + i}`,
      slug: `loadtest-${start + i}-${randomUUID().slice(0, 8)}`,
    }));
    await prisma.tenant.createMany({ data: tenants });

    // Cada tenant sintético también recibe clientes — el punto es que la
    // tabla Client (la que de verdad se consulta en producción) crezca
    // proporcionalmente en TODOS los tenants, no solo en el de referencia.
    // Si solo el tenant de referencia tuviera filas, el benchmark no
    // probaría nada sobre escalabilidad real.
    const clients = tenants.flatMap((t) =>
      Array.from({ length: CLIENTS_PER_TENANT }, (_, j) => ({
        id: randomUUID(),
        tenantId: t.id,
        firstName: 'Cliente',
        lastName: `Sintético ${j}`,
      })),
    );
    await prisma.client.createMany({ data: clients });
  }
}

// La misma query que ClientsService.findAll ejecuta en producción vía
// TenantPrismaService (ahí el tenantId lo inyecta la extensión sola; acá,
// hablando directo con Postgres, se pasa a mano — es la MISMA sentencia SQL).
async function benchmarkQuery(prisma: PrismaClient, tenantId: string, samples: number): Promise<number[]> {
  // Warm-up: no medir el costo de la primera conexión/plan cacheado.
  await prisma.client.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20 });

  const latenciesMs: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await prisma.client.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20 });
    latenciesMs.push(performance.now() - t0);
  }
  return latenciesMs.sort((a, b) => a - b);
}

async function main() {
  const sourceUrl = new URL(process.env.DATABASE_URL!);
  const dbName = `loadtest_${Date.now()}`;
  const dbUrl = new URL(sourceUrl.toString());
  dbUrl.pathname = `/${dbName}`;
  const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(sourceUrl.password) };
  const pgArgs = [`--host=${sourceUrl.hostname}`, `--port=${sourceUrl.port || '5432'}`, `--username=${sourceUrl.username}`];

  console.log(`[1/4] Creando base descartable "${dbName}"...`);
  await execFileAsync('createdb', [...pgArgs, dbName], { env: pgEnv });

  try {
    console.log('[2/4] Aplicando migraciones (prisma migrate deploy)...');
    await execFileAsync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: `${__dirname}/../..`,
      env: { ...process.env, DATABASE_URL: dbUrl.toString() },
    });

    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.toString() } } });
    try {
      console.log('[3/4] Corriendo checkpoints:', CHECKPOINTS.join(' → '));

      // Tenant de referencia: se crea PRIMERO, con sus propios clientes, y
      // se vuelve a consultar en cada checkpoint — la pregunta que importa
      // es si leer SUS datos se pone más lento a medida que se agregan
      // miles de OTROS tenants después, no cuánto tarda un tenant recién
      // creado (ese caso ya lo prueban los tests normales).
      const refTenant = await prisma.tenant.create({
        data: { name: 'Tenant de referencia', slug: `loadtest-ref-${Date.now()}` },
      });
      await prisma.client.createMany({
        data: Array.from({ length: CLIENTS_PER_TENANT }, (_, j) => ({
          id: randomUUID(),
          tenantId: refTenant.id,
          firstName: 'Cliente',
          lastName: `Referencia ${j}`,
        })),
      });

      let created = 1; // el tenant de referencia ya cuenta como 1
      const results: { checkpoint: number; p50: number; p95: number; p99: number; max: number }[] = [];

      for (const checkpoint of CHECKPOINTS) {
        if (checkpoint > created) {
          await growTenants(prisma, created, checkpoint);
          created = checkpoint;
        }
        const totalTenants = await prisma.tenant.count();
        const totalClients = await prisma.client.count();

        const latencies = await benchmarkQuery(prisma, refTenant.id, SAMPLES_PER_CHECKPOINT);
        const row = {
          checkpoint,
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          p99: percentile(latencies, 99),
          max: latencies[latencies.length - 1],
        };
        results.push(row);
        console.log(
          `  checkpoint=${checkpoint.toString().padStart(6)} tenants (real: ${totalTenants}, clients: ${totalClients}) ` +
            `p50=${row.p50.toFixed(2)}ms p95=${row.p95.toFixed(2)}ms p99=${row.p99.toFixed(2)}ms max=${row.max.toFixed(2)}ms`,
        );
      }

      console.log('\n[4/4] EXPLAIN ANALYZE de la query de referencia en el checkpoint más grande:\n');
      const plan = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN ANALYZE SELECT * FROM "Client" WHERE "tenantId" = '${refTenant.id}' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 20`,
      );
      for (const line of plan) console.log(' ', line['QUERY PLAN']);

      console.log('\nResumen (markdown):\n');
      console.log('| Tenants en la plataforma | p50 | p95 | p99 | max |');
      console.log('|---|---|---|---|---|');
      for (const r of results) {
        console.log(`| ${r.checkpoint.toLocaleString('es-AR')} | ${r.p50.toFixed(2)} ms | ${r.p95.toFixed(2)} ms | ${r.p99.toFixed(2)} ms | ${r.max.toFixed(2)} ms |`);
      }
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    console.log(`\nBorrando base descartable "${dbName}"...`);
    await execFileAsync('dropdb', [...pgArgs, '--if-exists', dbName], { env: pgEnv });
    console.log('Listo — la base de dev/test compartida nunca fue tocada.');
  }
}

main().catch((error) => {
  console.error('Load test falló:', error);
  process.exit(1);
});
