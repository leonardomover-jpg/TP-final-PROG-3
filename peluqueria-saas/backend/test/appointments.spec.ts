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

// 2026-03-02 es lunes (dayOfWeek=1) — el profesional principal tiene
// horario semanal cargado 09:00-18:00 los lunes.
const MONDAY = '2026-03-02';

// POST /auth/register-tenant y POST /auth/login están limitados a 5
// llamadas/60s cada uno — mismo motivo y estrategia de minimizar registros
// que en los archivos de tests anteriores: un tenant "principal" reusado
// por todos los tests que no necesitan aislamiento entre negocios, más uno
// por lado del test de aislamiento (3 llamadas en total).
describe('Agenda y Turnos (Etapa 10)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;
  let branchId: string;
  let professionalId: string;
  let serviceId: string;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'appt-main');
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

    const client = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Marta', lastName: 'Lopez' })
      .expect(201);
    clientId = client.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('reserva un turno dentro del horario disponible, calcula endAt según la duración del servicio', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T10:00:00.000Z` })
      .expect(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.startAt).toBe(`${MONDAY}T10:00:00.000Z`);
    expect(res.body.endAt).toBe(`${MONDAY}T10:30:00.000Z`); // 30 min de duración
    expect(res.body.professional.id).toBe(professionalId);
    expect(res.body.client.id).toBe(clientId);
  });

  it('rechaza un turno que se superpone con otro turno activo del mismo profesional', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T11:00:00.000Z` })
      .expect(201);
    expect(first.body.endAt).toBe(`${MONDAY}T11:30:00.000Z`);

    // Empieza 15 min antes de que termine el anterior -> se superpone.
    const overlapping = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T11:15:00.000Z` });
    expect(overlapping.status).toBe(409);

    // Justo a continuación (sin superposición) sí se puede.
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T11:30:00.000Z` })
      .expect(201);
  });

  it('rechaza un turno fuera del horario de disponibilidad del profesional', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T20:00:00.000Z` }); // después de las 18:00
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('disponibilidad');
  });

  it('rechaza un turno con un profesional no habilitado para el servicio', async () => {
    const otroServicio = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Color', durationMinutes: 60, price: 9000 })
      .expect(201);
    // Sin PUT .../professionals: ningún profesional está habilitado todavía.

    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId,
        professionalId,
        clientId,
        serviceId: otroServicio.body.id,
        startAt: `${MONDAY}T15:00:00.000Z`,
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('habilitado');
  });

  it('transiciones de estado: pending -> confirmed -> completed, y pending -> cancelled; rechaza transiciones inválidas', async () => {
    const appt = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T13:00:00.000Z` })
      .expect(201);

    // No se puede completar un turno todavía pending (falta confirmar).
    await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appt.body.id}/complete`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(400);

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appt.body.id}/confirm`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(201);
    expect(confirmed.body.status).toBe('confirmed');

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appt.body.id}/complete`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(201);
    expect(completed.body.status).toBe('completed');

    // Un turno completado ya no se puede cancelar.
    await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appt.body.id}/cancel`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ reason: 'no aplica' })
      .expect(400);

    const other = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T14:00:00.000Z` })
      .expect(201);
    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${other.body.id}/cancel`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ reason: 'Cliente avisó que no viene' })
      .expect(201);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.cancelReason).toBe('Cliente avisó que no viene');

    // Un turno cancelado NO bloquea el horario para uno nuevo.
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T14:00:00.000Z` })
      .expect(201);
  });

  it('listado con filtro por rango de fechas y por estado', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/appointments')
      .query({ from: `${MONDAY}T00:00:00.000Z`, to: `${MONDAY}T23:59:59.000Z`, professionalId })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body.every((a: any) => a.professional.id === professionalId)).toBe(true);

    const cancelledOnly = await request(app.getHttpServer())
      .get('/api/v1/appointments')
      .query({ status: 'cancelled' })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(cancelledOnly.body.every((a: any) => a.status === 'cancelled')).toBe(true);
  });

  it('lista de espera: alta, listado y baja', async () => {
    const entry = await request(app.getHttpServer())
      .post('/api/v1/waitlist')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ clientId, serviceId, preferredDate: MONDAY, notes: 'Prefiere la mañana' })
      .expect(201);
    expect(entry.body.status).toBe('waiting');

    const list = await request(app.getHttpServer())
      .get('/api/v1/waitlist')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(list.body.find((e: any) => e.id === entry.body.id)).toBeDefined();

    await request(app.getHttpServer())
      .delete(`/api/v1/waitlist/${entry.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    const listAfter = await request(app.getHttpServer())
      .get('/api/v1/waitlist')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(listAfter.body.find((e: any) => e.id === entry.body.id)).toBeUndefined();
  });

  it('requiere el permiso turnos.crear — el rol "Profesional" no puede reservar turnos', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional'); // sin turnos.crear (seed)
    const employeeEmail = `sinpermisoturnos-${Date.now()}@${mainSlug}.com`;

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
      .get('/api/v1/appointments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T16:00:00.000Z` })
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A no ve/accede a turnos de Tenant B ni por id directo', async () => {
    const tenantA = await registerTenant(app, 'appt-tenant-a');
    const tenantB = await registerTenant(app, 'appt-tenant-b');

    const branchesB = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .expect(200);
    const professionalB = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ firstName: 'Prof', lastName: 'DeB' })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/professionals/${professionalB.body.id}/schedule`)
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ entries: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }] })
      .expect(200);
    const serviceB = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Servicio de B', durationMinutes: 30, price: 4000 })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/services/${serviceB.body.id}/professionals`)
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ professionalIds: [professionalB.body.id] })
      .expect(200);
    const clientB = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ firstName: 'Cliente', lastName: 'DeB' })
      .expect(201);

    const apptB = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({
        branchId: branchesB.body[0].id,
        professionalId: professionalB.body.id,
        clientId: clientB.body.id,
        serviceId: serviceB.body.id,
        startAt: `${MONDAY}T09:00:00.000Z`,
      })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/appointments')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.find((a: any) => a.id === apptB.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/appointments/${apptB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    // Tenant A tampoco puede reservar usando referencias (profesional,
    // servicio, cliente) de Tenant B, aunque adivine sus ids.
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({
        branchId: branchesB.body[0].id,
        professionalId: professionalB.body.id,
        clientId: clientB.body.id,
        serviceId: serviceB.body.id,
        startAt: `${MONDAY}T09:00:00.000Z`,
      });
    expect(res.status).toBe(400);
  });
});
