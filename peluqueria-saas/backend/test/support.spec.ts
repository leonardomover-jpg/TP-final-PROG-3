import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function registerTenant(app: INestApplication, slug: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register-tenant')
    .send({
      businessName: `Negocio ${slug}`,
      slug,
      firstName: 'Admin',
      lastName: 'Negocio',
      email: `admin@${slug}.com`,
      password: 'SuperSecreta123!',
    })
    .expect(201);
  return res.body.accessToken as string;
}

describe('Soporte — tickets negocio + SUPER ADMIN (Etapa 3)', () => {
  let app: INestApplication;
  let tenantAToken: string;
  let tenantBToken: string;
  let platformAdminToken: string;
  let ticketIdTenantA: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenantAToken = await registerTenant(app, uniqueSlug('soporte-a'));
    tenantBToken = await registerTenant(app, uniqueSlug('soporte-b'));
    const admin = await createAndLoginPlatformAdmin(app, 'support-admin');
    platformAdminToken = admin.accessToken;

    const ticket = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({ subject: 'No puedo cerrar la caja', priority: 'high', body: 'Me tira un error al cerrar.' })
      .expect(201);
    ticketIdTenantA = ticket.body.id;
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('el negocio que crea el ticket lo ve en su propia lista', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200);
    expect(res.body.some((t: any) => t.id === ticketIdTenantA)).toBe(true);
  });

  it('otro negocio no ve ni puede acceder al ticket ajeno', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(200);
    expect(listRes.body.some((t: any) => t.id === ticketIdTenantA)).toBe(false);

    await request(app.getHttpServer())
      .get(`/api/v1/support/tickets/${ticketIdTenantA}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(404);
  });

  it('SUPER ADMIN ve el ticket entre todos los negocios y puede responder/cambiar estado', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/support/tickets')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
    expect(listRes.body.items.some((t: any) => t.id === ticketIdTenantA)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/support/tickets/${ticketIdTenantA}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ status: 'in_progress' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/platform-admin/support/tickets/${ticketIdTenantA}/messages`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ body: 'Ya lo estamos revisando.' })
      .expect(201);

    const ticketForTenant = await request(app.getHttpServer())
      .get(`/api/v1/support/tickets/${ticketIdTenantA}`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200);
    expect(ticketForTenant.body.status).toBe('in_progress');
    expect(ticketForTenant.body.messages.some((m: any) => m.body === 'Ya lo estamos revisando.')).toBe(true);
  });
});
