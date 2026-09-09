import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { testPrisma } from './helpers/platform-admin';

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

// 2026-03-02 es lunes (dayOfWeek=1) — mismo día usado en appointments.spec.ts.
const MONDAY = '2026-03-02';

// POST /auth/register-tenant limitado a 5/60s: un tenant "principal" (todo
// el flujo feliz de catálogo/disponibilidad/reserva pública + límite de
// plan) más uno para el test de aislamiento — 2 registros en total.
describe('Página pública + QR (Etapa 18, solo backend)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;
  let branchId: string;
  let professionalId: string;
  let serviceId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'pub-main');
    mainToken = main.token;
    mainSlug = main.slug;

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    branchId = branches.body[0].id;

    const professional = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Carla', lastName: 'Ruiz' })
      .expect(201);
    professionalId = professional.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/professionals/${professionalId}/schedule`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ entries: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }] })
      .expect(200);

    const service = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Corte', durationMinutes: 30, price: 5000 })
      .expect(201);
    serviceId = service.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/services/${serviceId}/professionals`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ professionalIds: [professionalId] })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('GET /public/:tenantSlug devuelve el catálogo público sin autenticación', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/public/${mainSlug}`).expect(200);
    expect(res.body.businessName).toBe('Negocio pub-main');
    expect(res.body.branches).toHaveLength(1);
    expect(res.body.branches[0].id).toBe(branchId);
    expect(res.body.branches[0]).not.toHaveProperty('tenantId');
    expect(res.body.services).toHaveLength(1);
    expect(res.body.services[0].id).toBe(serviceId);
    expect(res.body.services[0]).toHaveProperty('price');
    expect(res.body.professionals).toHaveLength(1);
    expect(res.body.professionals[0]).not.toHaveProperty('commissionPercentage');
  });

  it('GET /public/:tenantSlug/availability devuelve la disponibilidad delegando en ScheduleService', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/${mainSlug}/availability`)
      .query({ date: MONDAY, professionalId })
      .expect(200);
    expect(res.body.isOpen).toBe(true);
    expect(res.body.hours[0]).toEqual({ startTime: '09:00', endTime: '18:00' });
  });

  it('POST /public/:tenantSlug/appointments crea cliente nuevo + turno sin login', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/public/${mainSlug}/appointments`)
      .send({
        clientFirstName: 'Marta',
        clientLastName: 'Lopez',
        clientPhone: '+541122223333',
        branchId,
        professionalId,
        serviceId,
        startAt: `${MONDAY}T10:00:00.000Z`,
      })
      .expect(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.client.phone).toBe('+541122223333');

    const clientsRes = await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(clientsRes.body.find((c: any) => c.phone === '+541122223333')).toBeDefined();
  });

  it('reusa el cliente existente (mismo teléfono) en vez de duplicarlo, y rechaza turnos superpuestos', async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/v1/public/${mainSlug}/appointments`)
      .send({
        clientFirstName: 'Marta',
        clientLastName: 'Lopez',
        clientPhone: '+541122224444',
        branchId,
        professionalId,
        serviceId,
        startAt: `${MONDAY}T11:00:00.000Z`,
      })
      .expect(201);
    const clientId = first.body.client.id;

    const second = await request(app.getHttpServer())
      .post(`/api/v1/public/${mainSlug}/appointments`)
      .send({
        clientFirstName: 'Marta',
        clientLastName: 'Lopez',
        clientPhone: '+541122224444',
        branchId,
        professionalId,
        serviceId,
        startAt: `${MONDAY}T13:00:00.000Z`,
      })
      .expect(201);
    expect(second.body.client.id).toBe(clientId);

    // Superpuesto con el primero (11:00-11:30) -> rechazado, misma
    // validación de AppointmentsService.create reutilizada tal cual.
    const overlapping = await request(app.getHttpServer())
      .post(`/api/v1/public/${mainSlug}/appointments`)
      .send({
        clientFirstName: 'Marta',
        clientLastName: 'Lopez',
        clientPhone: '+541122224444',
        branchId,
        professionalId,
        serviceId,
        startAt: `${MONDAY}T11:15:00.000Z`,
      });
    expect(overlapping.status).toBe(409);
  });

  it('rechaza la reserva pública sin teléfono ni email de contacto', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/public/${mainSlug}/appointments`)
      .send({
        clientFirstName: 'Sin',
        clientLastName: 'Contacto',
        branchId,
        professionalId,
        serviceId,
        startAt: `${MONDAY}T14:00:00.000Z`,
      });
    expect(res.status).toBe(400);
  });

  it('respeta el límite de clientes del plan también en el alta pública', async () => {
    const tinyPlan = await testPrisma.plan.create({
      data: {
        name: `Tiny-${Date.now()}`,
        price: 1000,
        billingPeriod: 'monthly',
        maxUsers: 10,
        maxProfessionals: 10,
        maxBranches: 10,
        maxClients: 1,
        status: 'active',
      },
    });

    const tinyTenant = await registerTenant(app, 'pub-tiny');
    await request(app.getHttpServer())
      .post('/api/v1/subscription/select-plan')
      .set('Authorization', `Bearer ${tinyTenant.token}`)
      .send({ planId: tinyPlan.id })
      .expect(201);

    const tinyBranches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tinyTenant.token}`)
      .expect(200);
    const tinyBranchId = tinyBranches.body[0].id;

    const tinyProfessional = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${tinyTenant.token}`)
      .send({ firstName: 'Uno', lastName: 'Solo' })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/professionals/${tinyProfessional.body.id}/schedule`)
      .set('Authorization', `Bearer ${tinyTenant.token}`)
      .send({ entries: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }] })
      .expect(200);
    const tinyService = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${tinyTenant.token}`)
      .send({ name: 'Corte', durationMinutes: 30, price: 5000 })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/services/${tinyService.body.id}/professionals`)
      .set('Authorization', `Bearer ${tinyTenant.token}`)
      .send({ professionalIds: [tinyProfessional.body.id] })
      .expect(200);

    // Primer cliente nuevo: entra dentro del límite (maxClients: 1).
    await request(app.getHttpServer())
      .post(`/api/v1/public/${tinyTenant.slug}/appointments`)
      .send({
        clientFirstName: 'Primero',
        clientLastName: 'Cliente',
        clientPhone: '+541100000001',
        branchId: tinyBranchId,
        professionalId: tinyProfessional.body.id,
        serviceId: tinyService.body.id,
        startAt: `${MONDAY}T10:00:00.000Z`,
      })
      .expect(201);

    // Segundo cliente NUEVO (teléfono distinto): supera el límite -> 403.
    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/public/${tinyTenant.slug}/appointments`)
      .send({
        clientFirstName: 'Segundo',
        clientLastName: 'Cliente',
        clientPhone: '+541100000002',
        branchId: tinyBranchId,
        professionalId: tinyProfessional.body.id,
        serviceId: tinyService.body.id,
        startAt: `${MONDAY}T11:00:00.000Z`,
      });
    expect(blocked.status).toBe(403);
  });

  it('aísla el catálogo entre negocios: el slug de un tenant no expone datos de otro', async () => {
    const other = await registerTenant(app, 'pub-other');
    const res = await request(app.getHttpServer()).get(`/api/v1/public/${other.slug}`).expect(200);
    expect(res.body.services).toHaveLength(0);
    expect(res.body.branches[0].id).not.toBe(branchId);
  });

  it('un slug inexistente devuelve 404 genérico', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/no-existe-este-negocio').expect(404);
  });

  it('un negocio suspendido no es reservable públicamente (mismo 404 genérico)', async () => {
    await testPrisma.tenant.update({ where: { slug: mainSlug }, data: { status: 'suspended' } });
    try {
      await request(app.getHttpServer()).get(`/api/v1/public/${mainSlug}`).expect(404);
    } finally {
      await testPrisma.tenant.update({ where: { slug: mainSlug }, data: { status: 'active' } });
    }
  });

  it('GET /public/:tenantSlug/qr devuelve un PNG', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/public/${mainSlug}/qr`).expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('POST /public/:tenantSlug/appointments está limitado a 10 llamadas/60s', async () => {
    const results: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/public/${mainSlug}/appointments`)
        .send({
          clientFirstName: 'Rate',
          clientLastName: `Limit${i}`,
          clientPhone: `+54119000${String(i).padStart(4, '0')}`,
          branchId,
          professionalId,
          serviceId,
          startAt: `${MONDAY}T15:${String(i).padStart(2, '0')}:00.000Z`,
        });
      results.push(res.status);
    }
    expect(results).toContain(429);
  });
});
