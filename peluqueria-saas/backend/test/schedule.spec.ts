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

// 2026-01-01 (Año Nuevo, sembrado por el seed) cae jueves -> dayOfWeek=4.
const NEW_YEAR_2026 = '2026-01-01';
const NEW_YEAR_DAY_OF_WEEK = 4;

// POST /auth/register-tenant y POST /auth/login están limitados a 5
// llamadas/60s cada uno — mismo motivo y estrategia de minimizar registros
// que en los archivos de tests anteriores: un tenant "principal" reusado
// por los tests que no necesitan aislamiento entre negocios, más uno por
// lado del test de aislamiento (3 llamadas en total).
describe('Horarios (Etapa 9)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;
  let mainBranchId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'sch-main');
    mainToken = main.token;
    mainSlug = main.slug;

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    mainBranchId = branches.body[0].id;
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('horario semanal de la sucursal: PUT reemplaza completo y aparece en la ficha', async () => {
    const first = await request(app.getHttpServer())
      .put(`/api/v1/branches/${mainBranchId}/schedule`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        entries: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' },
          { dayOfWeek: 1, startTime: '14:00', endTime: '18:00' },
        ],
      })
      .expect(200);
    expect(first.body).toHaveLength(2);

    const second = await request(app.getHttpServer())
      .put(`/api/v1/branches/${mainBranchId}/schedule`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ entries: [{ dayOfWeek: NEW_YEAR_DAY_OF_WEEK, startTime: '10:00', endTime: '20:00' }] })
      .expect(200);
    expect(second.body).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/branches/${mainBranchId}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(detail.body.schedules).toHaveLength(1);
    expect(detail.body.schedules[0].dayOfWeek).toBe(NEW_YEAR_DAY_OF_WEEK);
  });

  it('disponibilidad: sin excepción ni feriado, usa el horario semanal (o "sin horario" si ese día no tiene)', async () => {
    // Un miércoles (dayOfWeek=3) cualquiera de 2026 sin excepciones: no hay
    // horario cargado para ese día (solo se cargó NEW_YEAR_DAY_OF_WEEK).
    const closed = await request(app.getHttpServer())
      .get('/api/v1/schedule/availability')
      .query({ date: '2026-03-04', branchId: mainBranchId }) // miércoles
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(closed.body.isOpen).toBe(false);
    expect(closed.body.reason).toContain('Sin horario');
  });

  it('excepciones: cierran un día puntual o lo abren con horario distinto, y se pueden borrar', async () => {
    const exception = await request(app.getHttpServer())
      .post('/api/v1/schedule/exceptions')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId: mainBranchId, date: '2026-03-11', isClosed: true, reason: 'Refacción' })
      .expect(201);

    const closedAvailability = await request(app.getHttpServer())
      .get('/api/v1/schedule/availability')
      .query({ date: '2026-03-11', branchId: mainBranchId })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(closedAvailability.body.isOpen).toBe(false);
    expect(closedAvailability.body.reason).toBe('Refacción');

    const list = await request(app.getHttpServer())
      .get('/api/v1/schedule/exceptions')
      .query({ branchId: mainBranchId })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(list.body.find((e: any) => e.id === exception.body.id)).toBeDefined();

    await request(app.getHttpServer())
      .delete(`/api/v1/schedule/exceptions/${exception.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    // Sin la excepción, vuelve a "sin horario" para ese día (miércoles, sin BranchSchedule cargado).
    const backToNormal = await request(app.getHttpServer())
      .get('/api/v1/schedule/availability')
      .query({ date: '2026-03-11', branchId: mainBranchId })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(backToNormal.body.reason).toContain('Sin horario');
  });

  it('excepción con horario distinto (isClosed=false) exige startTime/endTime, y rechaza branchId+professionalId juntos o ninguno', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/schedule/exceptions')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId: mainBranchId, date: '2026-03-06', isClosed: false })
      .expect(400);

    const opened = await request(app.getHttpServer())
      .post('/api/v1/schedule/exceptions')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: mainBranchId,
        date: '2026-03-06',
        isClosed: false,
        startTime: '08:00',
        endTime: '12:00',
        reason: 'Horario reducido',
      })
      .expect(201);
    expect(opened.body.startTime).toBe('08:00');

    const availability = await request(app.getHttpServer())
      .get('/api/v1/schedule/availability')
      .query({ date: '2026-03-06', branchId: mainBranchId })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(availability.body.isOpen).toBe(true);
    expect(availability.body.hours).toEqual([{ startTime: '08:00', endTime: '12:00' }]);

    await request(app.getHttpServer())
      .post('/api/v1/schedule/exceptions')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ date: '2026-03-07' }) // ni branchId ni professionalId
      .expect(400);

    const professional = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Prof', lastName: 'Test' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/schedule/exceptions')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId: mainBranchId, professionalId: professional.body.id, date: '2026-03-08' }) // los dos juntos
      .expect(400);
  });

  it('feriados: catálogo con override por negocio (default cerrado, override abre y usa el horario semanal)', async () => {
    const holidays = await request(app.getHttpServer())
      .get('/api/v1/schedule/holidays')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const newYear = holidays.body.find((h: any) => h.name === 'Año Nuevo');
    expect(newYear).toBeDefined();
    expect(newYear.isOpenForTenant).toBe(false); // sin override = cerrado por default

    const closedByDefault = await request(app.getHttpServer())
      .get('/api/v1/schedule/availability')
      .query({ date: NEW_YEAR_2026, branchId: mainBranchId })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(closedByDefault.body.isOpen).toBe(false);
    expect(closedByDefault.body.reason).toContain('Año Nuevo');

    await request(app.getHttpServer())
      .patch(`/api/v1/schedule/holidays/${newYear.id}/override`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ isOpen: true })
      .expect(200);

    // Con override abierto, cae al horario semanal cargado para ese día
    // (NEW_YEAR_DAY_OF_WEEK, 10:00-20:00, cargado en el primer test).
    const openWithOverride = await request(app.getHttpServer())
      .get('/api/v1/schedule/availability')
      .query({ date: NEW_YEAR_2026, branchId: mainBranchId })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(openWithOverride.body.isOpen).toBe(true);
    expect(openWithOverride.body.hours).toEqual([{ startTime: '10:00', endTime: '20:00' }]);

    const holidaysAfter = await request(app.getHttpServer())
      .get('/api/v1/schedule/holidays')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(holidaysAfter.body.find((h: any) => h.name === 'Año Nuevo').isOpenForTenant).toBe(true);
  });

  it('requiere el permiso horarios.gestionar para crear excepciones/overrides, y horarios.ver para consultar', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    // "Profesional" tiene horarios.ver pero no horarios.gestionar (seed).
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
    const employeeEmail = `sinpermisohorarios-${Date.now()}@${mainSlug}.com`;

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
      .get('/api/v1/schedule/holidays')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/schedule/exceptions')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ branchId: mainBranchId, date: '2026-03-09' })
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A no ve excepciones/disponibilidad de la sucursal de Tenant B, y los overrides de feriados son por negocio', async () => {
    const tenantA = await registerTenant(app, 'sch-tenant-a');
    const tenantB = await registerTenant(app, 'sch-tenant-b');

    const branchesB = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .expect(200);
    const branchB = branchesB.body[0].id;

    // Tenant A no puede consultar disponibilidad de una sucursal de B (id ajeno).
    await request(app.getHttpServer())
      .get('/api/v1/schedule/availability')
      .query({ date: '2026-03-10', branchId: branchB })
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    // Tampoco puede cargar una excepción para esa sucursal ajena.
    await request(app.getHttpServer())
      .post('/api/v1/schedule/exceptions')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ branchId: branchB, date: '2026-03-10' })
      .expect(400);

    // El override de feriado de Tenant B no afecta a Tenant A (mismo Holiday, distinto tenant).
    const holidaysA = await request(app.getHttpServer())
      .get('/api/v1/schedule/holidays')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    const newYearA = holidaysA.body.find((h: any) => h.name === 'Año Nuevo');

    await request(app.getHttpServer())
      .patch(`/api/v1/schedule/holidays/${newYearA.id}/override`)
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ isOpen: true })
      .expect(200);

    const holidaysAAfter = await request(app.getHttpServer())
      .get('/api/v1/schedule/holidays')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(holidaysAAfter.body.find((h: any) => h.name === 'Año Nuevo').isOpenForTenant).toBe(false);
  });
});
