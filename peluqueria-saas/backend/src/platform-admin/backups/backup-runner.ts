import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const execFileAsync = promisify(execFile);

// Funciones puras, sin estado — mismo criterio que mercado-pago-client.ts/
// whatsapp-client.ts: parametrizadas explícitamente, nada de leer
// process.env acá adentro, fáciles de invocar desde el service o desde el
// script de automatización (scripts/run-backup.ts) por igual.
//
// SIEMPRE `execFile` con argumentos como array, nunca un string armado a
// mano ni `exec` — ninguna de estas rutas concatena input de un cliente
// HTTP (los únicos "inputs" son el propio DATABASE_URL del servidor y
// paths generados acá mismo), pero se mantiene la misma disciplina de
// nunca construir un comando de shell por interpolación de todos modos.

export async function createDump(databaseUrl: string, outputDir: string): Promise<{ filePath: string; sizeBytes: number }> {
  await fs.mkdir(outputDir, { recursive: true });
  const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  const filePath = path.join(outputDir, filename);

  await execFileAsync('pg_dump', [databaseUrl, '--format=plain', '--no-owner', '--no-privileges', '--file', filePath]);

  const stat = await fs.stat(filePath);
  return { filePath, sizeBytes: stat.size };
}

export function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Tablas "core" para el chequeo de sanidad post-restauración — no hace
// falta comparar las 50+ tablas del sistema para probar que el dump
// restaura de verdad: alcanza con una muestra representativa que cubra
// el nivel plataforma (Tenant) y el nivel negocio (User).
const SANITY_CHECK_TABLES = ['Tenant', 'User'] as const;

async function countRows(prisma: PrismaClient, table: (typeof SANITY_CHECK_TABLES)[number]): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint as count FROM "${table}"`);
  return Number(rows[0].count);
}

// Verificación REAL por restauración (doc `28-BACKUPS.md` §2, punto del
// roadmap "no solo 'se generó el archivo'"): crea una base descartable,
// restaura el dump ahí, compara conteos de tablas core contra la base
// origen, y borra la base temporal pase lo que pase.
export async function verifyByRestore(
  sourceDatabaseUrl: string,
  dumpFilePath: string,
): Promise<{ ok: boolean; detail: string }> {
  const sourceUrl = new URL(sourceDatabaseUrl);
  const tempDbName = `backup_verify_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  const tempUrl = new URL(sourceDatabaseUrl);
  tempUrl.pathname = `/${tempDbName}`;

  const adminPrisma = new PrismaClient({ datasources: { db: { url: sourceDatabaseUrl } } });
  let tempPrisma: PrismaClient | undefined;
  try {
    const sourceCounts = await Promise.all(SANITY_CHECK_TABLES.map((t) => countRows(adminPrisma, t)));

    await execFileAsync('createdb', [`--host=${sourceUrl.hostname}`, `--port=${sourceUrl.port || '5432'}`, `--username=${sourceUrl.username}`, tempDbName], {
      env: { ...process.env, PGPASSWORD: decodeURIComponent(sourceUrl.password) },
    });

    try {
      await execFileAsync('psql', [tempUrl.toString(), '--file', dumpFilePath, '--set', 'ON_ERROR_STOP=1', '--quiet']);

      tempPrisma = new PrismaClient({ datasources: { db: { url: tempUrl.toString() } } });
      const restoredCounts = await Promise.all(SANITY_CHECK_TABLES.map((t) => countRows(tempPrisma!, t)));

      const mismatches = SANITY_CHECK_TABLES.filter((_, i) => sourceCounts[i] !== restoredCounts[i]);
      if (mismatches.length > 0) {
        return {
          ok: false,
          detail: `Conteos no coinciden tras restaurar: ${mismatches
            .map((t, i) => `${t} (origen=${sourceCounts[SANITY_CHECK_TABLES.indexOf(t)]}, restaurado=${restoredCounts[SANITY_CHECK_TABLES.indexOf(t)]})`)
            .join(', ')}`,
        };
      }
      return { ok: true, detail: `Restauración verificada: ${SANITY_CHECK_TABLES.join(', ')} coinciden (${sourceCounts.join('/')} filas).` };
    } finally {
      await tempPrisma?.$disconnect();
      await execFileAsync('dropdb', [`--host=${sourceUrl.hostname}`, `--port=${sourceUrl.port || '5432'}`, `--username=${sourceUrl.username}`, '--if-exists', tempDbName], {
        env: { ...process.env, PGPASSWORD: decodeURIComponent(sourceUrl.password) },
      });
    }
  } finally {
    await adminPrisma.$disconnect();
  }
}
