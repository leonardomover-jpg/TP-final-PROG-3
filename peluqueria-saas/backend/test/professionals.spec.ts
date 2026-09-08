import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

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
// estrategia de minimizar registros que en clients.spec.ts (Etapa 6): un
// tenant "principal" reusado por los tests que no necesitan aislamiento
// entre negocios, más uno por lado del test de aislamiento y uno para el
// de límite de plan (4 llamadas a register-tenant en total).
describe('Profesionales (Etapa 7)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'prof-main');
    mainToken = main.token;
    mainSlug = main.slug;
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('CRUD básico: crear, listar, ver ficha, editar y soft delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        firstName: 'Carla',
        lastName: 'Ruiz',
        phone: '1144556677',
        specialties: ['corte', 'color'],
        commissionPercentage: 15.5,
      })
      .expect(201);
    expect(created.body.id).toBeDefined();
    expect(created.body.status).toBe('active');
    expect(created.body.specialties).toEqual(['corte', 'color']);
    expect(created.body.commissionPercentage).toBe('15.5');

    const list = await request(app.getHttpServer())
      .get('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(list.body.find((p: any) => p.id === created.body.id)).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/professionals/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(detail.body.firstName).toBe('Carla');
    expect(detail.body.schedules).toEqual([]);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/professionals/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ commissionPercentage: 20 })
      .expect(200);
    expect(updated.body.commissionPercentage).toBe('20');

    await request(app.getHttpServer())
      .delete(`/api/v1/professionals/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    const listAfterDelete = await request(app.getHttpServer())
      .get('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(listAfterDelete.body.find((p: any) => p.id === created.body.id)).toBeUndefined();

    // Soft delete: la fila sigue en la base (punto 97 del pedido).
    const stillInDb = await testPrisma.professional.findUnique({ where: { id: created.body.id } });
    expect(stillInDb).not.toBeNull();
    expect(stillInDb?.deletedAt).not.toBeNull();

    await request(app.getHttpServer())
      .get(`/api/v1/professionals/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(404);
  });

  it('horario semanal: PUT reemplaza el horario completo, no lo acumula', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Con', lastName: 'Horario' })
      .expect(201);

    const first = await request(app.getHttpServer())
      .put(`/api/v1/professionals/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        entries: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' },
          { dayOfWeek: 1, startTime: '14:00', endTime: '18:00' },
        ],
      })
      .expect(200);
    expect(first.body).toHaveLength(2);

    // Reemplazo completo: un segundo PUT con menos entradas no deja restos del anterior.
    const second = await request(app.getHttpServer())
      .put(`/api/v1/professionals/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ entries: [{ dayOfWeek: 2, startTime: '10:00', endTime: '16:00' }] })
      .expect(200);
    expect(second.body).toHaveLength(1);
    expect(second.body[0].dayOfWeek).toBe(2);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/professionals/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(detail.body.schedules).toHaveLength(1);

    // Formato de hora inválido se rechaza.
    await request(app.getHttpServer())
      .put(`/api/v1/professionals/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ entries: [{ dayOfWeek: 1, startTime: '25:00', endTime: '18:00' }] })
      .expect(400);
  });

  it('vínculo opcional a User: vincular, no duplicar vínculo, y desvincular con null', async () => {
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');

    const user = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        firstName: 'Vincula',
        lastName: 'Ble',
        email: `vinculable-${Date.now()}@${mainSlug}.com`,
        password: 'SuperSecreta123!',
        roleIds: [profesionalRole.id],
        branchIds: [branches.body[0].id],
      })
      .expect(201);

    const professional = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Vinculado', lastName: 'Test', userId: user.body.id })
      .expect(201);
    expect(professional.body.userId).toBe(user.body.id);

    // Ese mismo User ya no se puede vincular a un SEGUNDO profesional.
    const secondAttempt = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Otro', lastName: 'Intento', userId: user.body.id });
    expect(secondAttempt.status).toBe(409);

    // Desvincular con userId: null.
    const unlinked = await request(app.getHttpServer())
      .patch(`/api/v1/professionals/${professional.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ userId: null })
      .expect(200);
    expect(unlinked.body.userId).toBeNull();

    // Un userId inexistente (o de otro tenant) se rechaza con 400, no con un 500 de constraint.
    const created2 = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Sin', lastName: 'UserValido', userId: 'no-existe-este-id' });
    expect(created2.status).toBe(400);
  });

  it('requiere el permiso profesionales.crear — un rol sin ese permiso no puede crear', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    // "Profesional" tiene profesionales.ver pero no profesionales.crear (seed).
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
    const employeeEmail = `sinpermisoprofesionales-${Date.now()}@${mainSlug}.com`;

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
      .get('/api/v1/professionals')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ firstName: 'Intento', lastName: 'Fallido' })
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A no ve/edita/borra profesionales de Tenant B ni por id directo', async () => {
    const tenantA = await registerTenant(app, 'prof-tenant-a');
    const tenantB = await registerTenant(app, 'prof-tenant-b');

    const professionalB = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ firstName: 'Profesional', lastName: 'DeB' })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/professionals')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.find((p: any) => p.id === professionalB.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/professionals/${professionalB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/professionals/${professionalB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ firstName: 'Hackeado' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/professionals/${professionalB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .put(`/api/v1/professionals/${professionalB.body.id}/schedule`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ entries: [] })
      .expect(404);
  });

  it('el límite de plan (maxProfessionals) bloquea crear un profesional de más', async () => {
    const platformAdmin = await createAndLoginPlatformAdmin(app, 'professionals-limit-admin');
    const smallPlan = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/plans')
      .set('Authorization', `Bearer ${platformAdmin.accessToken}`)
      .send({
        name: `Mini Profesionales ${Date.now()}`,
        price: 100,
        billingPeriod: 'monthly',
        maxUsers: 10,
        maxProfessionals: 2,
        maxBranches: 5,
        maxClients: 100,
      })
      .expect(201);

    const { token, tenantId } = await registerTenant(app, 'prof-limite');
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdmin.accessToken}`)
      .send({ planId: smallPlan.body.id })
      .expect(200);

    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/professionals')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: `Prof${i}`, lastName: 'Limite' })
        .expect(201);
    }

    const planInfo = await request(app.getHttpServer())
      .get('/api/v1/plan')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const professionalsUsage = planInfo.body.usage.find((u: any) => u.resource === 'professionals');
    expect(professionalsUsage.current).toBe(2);
    expect(professionalsUsage.max).toBe(2);

    const res = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Tercero', lastName: 'Bloqueado' });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('límite');
  });
});
