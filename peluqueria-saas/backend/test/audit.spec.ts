import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function registerTenant(app: INestApplication, prefix: string) {
  const slug = uniqueSlug(prefix);
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register-tenant')
    .send({
      businessName: `Negocio ${prefix}`,
      slug,
      firstName: 'Admin',
      lastName: 'Negocio',
      email: `admin@${slug}.com`,
      password: 'SuperSecreta123!',
    })
    .expect(201);
  return { token: res.body.accessToken as string, tenantId: res.body.tenant.id as string, slug };
}

// POST /auth/register-tenant limitado a 5/60s: un tenant principal + uno
// de aislamiento + uno para el flujo público — 3 registros en total.
describe('Auditoría (Etapa 22)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;
  let branchId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'audit-main');
    mainToken = main.token;
    mainSlug = main.slug;

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    branchId = branches.body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('el registro del tenant ya generó una entrada de auditoría semántica ("tenant.registered")', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(res.body.items.some((i: any) => i.action === 'tenant.registered')).toBe(true);
  });

  it('una mutación (POST /branches) genera una entrada GENÉRICA vía el interceptor global', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Sucursal Norte' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ entityType: 'branches', action: 'post:branches' })
      .expect(200);

    // Un POST no trae :id en la URL (el id lo genera la respuesta, no la
    // request) — entityId queda vacío para altas, a diferencia de un
    // PATCH/DELETE por id. Documentado como limitación conocida, no bug.
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const entry = res.body.items[0];
    expect(entry.action).toBe('post:branches');
    expect(entry.actorType).toBe('user');
    expect(entry.entityType).toBe('branches');
  });

  it('un GET no genera ninguna entrada de auditoría', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(after.body.total).toBe(before.body.total);
  });

  it('filtra por rango de fechas (from/to)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ from: '2020-01-01', to: '2020-01-02' })
      .expect(200);
    expect(res.body.total).toBe(0);
  });

  it('sin el permiso auditoria.ver, responde 403', async () => {
    const role = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Sin Auditoria', permissionKeys: ['sucursales.ver'] })
      .expect(201);

    const email = `sinauditoria-${Date.now()}@${mainSlug}.com`;
    const password = 'SuperSecreta123!';
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        firstName: 'Sin',
        lastName: 'Auditoria',
        email,
        password,
        roleIds: [role.body.id],
        branchIds: [branchId],
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: mainSlug, email, password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('aislamiento multi-tenant: un negocio nuevo no ve las entradas de auditoría de otro', async () => {
    const other = await registerTenant(app, 'audit-other');
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    // Un negocio recién creado solo tiene su propio "tenant.registered" —
    // nada de la sucursal ni los usuarios creados en el tenant principal.
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].action).toBe('tenant.registered');
  });
});
