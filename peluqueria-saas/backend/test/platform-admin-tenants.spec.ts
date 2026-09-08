import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('PlatformAdmin — gestión de negocios (Etapa 3)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'tenants-admin');
    adminToken = admin.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('SUPER ADMIN crea un negocio con su usuario admin inicial', async () => {
    const slug = uniqueSlug('creado-por-admin');
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        businessName: 'Creado Por SUPER ADMIN',
        slug,
        adminFirstName: 'Nueva',
        adminLastName: 'Cuenta',
        adminEmail: `admin@${slug}.com`,
        adminPassword: 'SuperSecreta123!',
      })
      .expect(201);

    expect(res.body.slug).toBe(slug);
    expect(res.body.status).toBe('active');

    // El usuario admin creado puede loguearse normalmente.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email: `admin@${slug}.com`, password: 'SuperSecreta123!' })
      .expect(200);
  });

  it('lista y filtra negocios por búsqueda de nombre/slug', async () => {
    const slug = uniqueSlug('buscable-xyz');
    await request(app.getHttpServer())
      .post('/api/v1/platform-admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        businessName: 'Negocio Buscable XYZ',
        slug,
        adminFirstName: 'AA',
        adminLastName: 'BB',
        adminEmail: `a@${slug}.com`,
        adminPassword: 'SuperSecreta123!',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/tenants')
      .query({ search: 'buscable-xyz' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.items.some((t: any) => t.slug === slug)).toBe(true);
  });

  it('suspender un negocio bloquea el login y el acceso con tokens ya emitidos', async () => {
    const slug = uniqueSlug('a-suspender');
    const email = `admin@${slug}.com`;
    const password = 'SuperSecreta123!';

    const created = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        businessName: 'A Suspender',
        slug,
        adminFirstName: 'AA',
        adminLastName: 'BB',
        adminEmail: email,
        adminPassword: password,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email, password })
      .expect(200);
    const tenantAccessToken = login.body.accessToken;

    // Todavía activo: el token funciona.
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tenantAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${created.body.id}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Login nuevo: rechazado.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email, password })
      .expect(401);

    // Token viejo, ya emitido: también rechazado (se revalida el tenant en cada request).
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tenantAccessToken}`)
      .expect(401);

    // Reactivar restaura el acceso.
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${created.body.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email, password })
      .expect(200);
  });

  it('cancelar un negocio también bloquea el acceso', async () => {
    const slug = uniqueSlug('a-cancelar');
    const email = `admin@${slug}.com`;
    const password = 'SuperSecreta123!';

    const created = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        businessName: 'A Cancelar',
        slug,
        adminFirstName: 'AA',
        adminLastName: 'BB',
        adminEmail: email,
        adminPassword: password,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email, password })
      .expect(401);

    const auditLogs = await testPrisma.auditLog.findMany({
      where: { tenantId: created.body.id, action: 'tenant.cancelled' },
    });
    expect(auditLogs.length).toBe(1);
  });
});
