import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('Límites de plan — PlanLimitsGuard (Etapa 4)', () => {
  let app: INestApplication;
  let platformAdminToken: string;
  let basicoPlanId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'limits-admin');
    platformAdminToken = admin.accessToken;

    const plans = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/plans')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
    basicoPlanId = plans.body.find((p: any) => p.name === 'Básico').id; // maxUsers: 3, maxBranches: 1
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('un negocio sin plan asignado no tiene límite (max=null) y puede seguir creando', async () => {
    const slug = uniqueSlug('sin-plan-limite');
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Sin Plan',
        slug,
        firstName: 'Admin',
        lastName: 'Negocio',
        email: `admin@${slug}.com`,
        password: 'SuperSecreta123!',
      })
      .expect(201);
    const token = reg.body.accessToken;

    const planInfo = await request(app.getHttpServer())
      .get('/api/v1/plan')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(planInfo.body.plan).toBeNull();
    expect(planInfo.body.usage.find((u: any) => u.resource === 'users').max).toBeNull();

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');

    // Sin plan asignado no hay límite contra el cual comparar (doc 05 §1):
    // se pueden crear más usuarios que el máximo de cualquier plan real sin
    // que PlanLimitsGuard bloquee nada.
    for (let i = 0; i < 4; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: `Extra${i}`,
          lastName: 'Usuario',
          email: `extra${i}@${slug}.com`,
          password: 'SuperSecreta123!',
          roleIds: [profesionalRole.id],
          branchIds: [branches.body[0].id],
        })
        .expect(201);
    }
  });

  it('el plan Básico (maxUsers=3) bloquea crear un 4to usuario', async () => {
    const slug = uniqueSlug('basico-limite');
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Básico Limite',
        slug,
        firstName: 'Admin',
        lastName: 'Negocio',
        email: `admin@${slug}.com`,
        password: 'SuperSecreta123!',
      })
      .expect(201);
    const token = reg.body.accessToken;
    const tenantId = reg.body.tenant.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ planId: basicoPlanId })
      .expect(200);

    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');

    // El admin ya cuenta como 1 de 3. Se crean 2 más para llegar al límite.
    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: `Empleado${i}`,
          lastName: 'Test',
          email: `empleado${i}@${slug}.com`,
          password: 'SuperSecreta123!',
          roleIds: [profesionalRole.id],
          branchIds: [branches.body[0].id],
        })
        .expect(201);
    }

    const planInfo = await request(app.getHttpServer())
      .get('/api/v1/plan')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const usersUsage = planInfo.body.usage.find((u: any) => u.resource === 'users');
    expect(usersUsage.current).toBe(3);
    expect(usersUsage.max).toBe(3);

    // El 4to usuario supera el límite del plan.
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Cuarto',
        lastName: 'Usuario',
        email: `cuarto@${slug}.com`,
        password: 'SuperSecreta123!',
        roleIds: [profesionalRole.id],
        branchIds: [branches.body[0].id],
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('límite');
  });

  it('el plan Básico (maxBranches=1) bloquea crear una 2da sucursal', async () => {
    const slug = uniqueSlug('basico-sucursal');
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Básico Sucursal',
        slug,
        firstName: 'Admin',
        lastName: 'Negocio',
        email: `admin@${slug}.com`,
        password: 'SuperSecreta123!',
      })
      .expect(201);
    const token = reg.body.accessToken;
    const tenantId = reg.body.tenant.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ planId: basicoPlanId })
      .expect(200);

    // Ya tiene 1 sucursal (la principal, creada en el registro) = límite alcanzado.
    const res = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sucursal Extra' });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('límite');
  });
});
