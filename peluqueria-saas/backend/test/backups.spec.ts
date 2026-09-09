import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';
import { computeSha256 } from '../src/platform-admin/backups/backup-runner';

// BACKUP_DIR propio del test (aislado del ./backups por defecto) — se
// limpia enteramente en afterAll. Se fija ANTES de crear la app porque
// PlatformAdminBackupsService lee process.env.BACKUP_DIR en cada `run()`.
const TEST_BACKUP_DIR = path.join(__dirname, '..', 'tmp-test-backups');
process.env.BACKUP_DIR = TEST_BACKUP_DIR;

describe('PlatformAdmin — Backups (Etapa 24)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'backups-admin');
    adminToken = admin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
    await fs.rm(TEST_BACKUP_DIR, { recursive: true, force: true });
  });

  it('SUPER ADMIN corre un backup real: dump + checksum + verificación por restauración', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/backups/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(res.body.status).toBe('verified');
    expect(res.body.sizeBytes).toBeGreaterThan(0);
    expect(res.body.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.completedAt).not.toBeNull();
    expect(res.body.verifiedAt).not.toBeNull();
    expect(res.body.errorMessage).toBeNull();

    // El archivo existe de verdad en disco, con el tamaño y checksum
    // registrados en la fila — no alcanza con "el service dice que sí".
    const filePath = path.join(TEST_BACKUP_DIR, res.body.filename);
    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(res.body.sizeBytes);
    const checksum = await computeSha256(filePath);
    expect(checksum).toBe(res.body.checksumSha256);

    // No debe quedar ninguna base temporal de verificación colgada.
    const dbNameRows = await testPrisma.$queryRawUnsafe<{ datname: string }[]>(
      "SELECT datname FROM pg_database WHERE datname LIKE 'backup_verify_%'",
    );
    expect(dbNameRows).toHaveLength(0);
  }, 60_000);

  it('GET /platform-admin/backups lista los backups corridos, más reciente primero', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/backups')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0]).toHaveProperty('status');
  });

  it('GET /platform-admin/backups/:id devuelve el detalle de un backup', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/backups')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const id = listRes.body.items[0].id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/platform-admin/backups/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.id).toBe(id);
  });

  it('GET /platform-admin/backups/:id con id inexistente devuelve 404', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/platform-admin/backups/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('sin token de SUPER ADMIN, todos los endpoints de backups devuelven 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/platform-admin/backups').expect(401);
    await request(app.getHttpServer()).post('/api/v1/platform-admin/backups/run').expect(401);
  });
});
