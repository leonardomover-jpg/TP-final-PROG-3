import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('PlatformAdmin — comunicaciones globales (Etapa 3)', () => {
  let app: INestApplication;
  let adminToken: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'comms-admin');
    adminToken = admin.accessToken;

    const slug = uniqueSlug('comms-target');
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Negocio Destino',
        slug,
        firstName: 'Admin',
        lastName: 'Negocio',
        email: `admin@${slug}.com`,
        password: 'SuperSecreta123!',
      })
      .expect(201);
    tenantId = reg.body.tenant.id;
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('crea una comunicación para "todos"', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Mantenimiento programado', body: 'El sábado a la noche.', audienceType: 'all' })
      .expect(201);
    expect(res.body.audienceType).toBe('all');
  });

  it('crea una comunicación para negocios específicos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Aviso puntual',
        body: 'Solo para vos.',
        audienceType: 'tenants',
        tenantIds: [tenantId],
      })
      .expect(201);
    expect(res.body.tenants.some((t: any) => t.tenantId === tenantId)).toBe(true);
  });

  it('rechaza audienceType "tenants" sin tenantIds', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/platform-admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Aviso incompleto', body: 'Falta destinatario.', audienceType: 'tenants' })
      .expect(400);
  });

  it('rechaza un tenantId inexistente', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/platform-admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Aviso inválido',
        body: 'Destinatario fantasma.',
        audienceType: 'tenants',
        tenantIds: ['no-existe'],
      })
      .expect(400);
  });

  it('lista las comunicaciones creadas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });
});
