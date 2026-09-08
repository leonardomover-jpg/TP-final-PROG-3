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

// POST /auth/register-tenant y POST /auth/login están limitados a 5
// llamadas/60s cada uno (auth.controller.ts) — mismo motivo y misma
// estrategia de minimizar registros que en clients.spec.ts/professionals.spec.ts:
// un tenant "principal" reusado por los tests que no necesitan aislamiento
// entre negocios, más uno por lado del test de aislamiento (3 llamadas en total).
describe('Servicios (Etapa 8)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'svc-main');
    mainToken = main.token;
    mainSlug = main.slug;
  });

  afterAll(async () => {
    await app.close();
  });

  it('CRUD básico: crear, listar, ver ficha, editar y soft delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        name: 'Corte de pelo',
        description: 'Corte clásico',
        category: 'corte',
        durationMinutes: 30,
        price: 5000,
      })
      .expect(201);
    expect(created.body.id).toBeDefined();
    expect(created.body.status).toBe('active');
    expect(created.body.price).toBe('5000');

    const list = await request(app.getHttpServer())
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(list.body.find((s: any) => s.id === created.body.id)).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/services/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(detail.body.name).toBe('Corte de pelo');
    expect(detail.body.professionals).toEqual([]);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/services/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ price: 6000, durationMinutes: 45 })
      .expect(200);
    expect(updated.body.price).toBe('6000');
    expect(updated.body.durationMinutes).toBe(45);

    await request(app.getHttpServer())
      .delete(`/api/v1/services/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    const listAfterDelete = await request(app.getHttpServer())
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(listAfterDelete.body.find((s: any) => s.id === created.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/services/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(404);
  });

  it('profesionales habilitados: PUT reemplaza la lista completa y valida pertenencia al tenant', async () => {
    const service = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Color', durationMinutes: 60, price: 8000 })
      .expect(201);

    const prof1 = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Prof', lastName: 'Uno' })
      .expect(201);
    const prof2 = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Prof', lastName: 'Dos' })
      .expect(201);

    const firstSet = await request(app.getHttpServer())
      .put(`/api/v1/services/${service.body.id}/professionals`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ professionalIds: [prof1.body.id, prof2.body.id] })
      .expect(200);
    expect(firstSet.body).toHaveLength(2);

    // Reemplazo completo: un segundo PUT con un solo id no deja restos del anterior.
    const secondSet = await request(app.getHttpServer())
      .put(`/api/v1/services/${service.body.id}/professionals`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ professionalIds: [prof1.body.id] })
      .expect(200);
    expect(secondSet.body).toHaveLength(1);
    expect(secondSet.body[0].id).toBe(prof1.body.id);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/services/${service.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(detail.body.professionals).toHaveLength(1);

    // Un id de profesional inexistente se rechaza con 400.
    await request(app.getHttpServer())
      .put(`/api/v1/services/${service.body.id}/professionals`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ professionalIds: ['no-existe-este-id'] })
      .expect(400);
  });

  it('requiere el permiso servicios.crear — un rol sin ese permiso no puede crear', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    // "Profesional" tiene servicios.ver pero no servicios.crear (seed).
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
    const employeeEmail = `sinpermisoservicios-${Date.now()}@${mainSlug}.com`;

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        firstName: 'Sin',
        lastName: 'Permiso',
        email: employeeEmail,
        password,
        roleIds: [profesionalRole.id],
        branchIds: [branches.body[0].id],
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: mainSlug, email: employeeEmail, password })
      .expect(200);
    const employeeToken = login.body.accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ name: 'Intento fallido', durationMinutes: 30, price: 1000 })
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A no ve/edita/borra servicios de Tenant B ni por id directo, y no puede habilitar profesionales ajenos', async () => {
    const tenantA = await registerTenant(app, 'svc-tenant-a');
    const tenantB = await registerTenant(app, 'svc-tenant-b');

    const serviceB = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Servicio de B', durationMinutes: 20, price: 3000 })
      .expect(201);
    const professionalB = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ firstName: 'Profesional', lastName: 'DeB' })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.find((s: any) => s.id === serviceB.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/services/${serviceB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/services/${serviceB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: 'Hackeado' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/services/${serviceB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    // Un servicio de A no puede habilitar un profesional de B (cross-tenant leak).
    const serviceA = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: 'Servicio de A', durationMinutes: 20, price: 3000 })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/services/${serviceA.body.id}/professionals`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ professionalIds: [professionalB.body.id] })
      .expect(400);
  });
});
