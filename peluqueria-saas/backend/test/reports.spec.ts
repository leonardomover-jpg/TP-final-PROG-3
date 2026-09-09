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

const MONDAY = '2026-03-02';

// POST /auth/register-tenant y POST /auth/login limitados a 5/60s: un
// tenant "principal" (todo el flujo feliz) + uno para aislamiento + un
// login (usuario sin permiso) — 3 llamadas en total.
describe('Dashboard y Reportes (Etapa 20)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;
  let branchId: string;
  let professionalId: string;
  let serviceId: string;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'reports-main');
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

    // Un turno pendiente (cuenta en appointmentsByStatus).
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, professionalId, clientId, serviceId, startAt: `${MONDAY}T10:00:00.000Z` })
      .expect(201);

    // Una venta completada (cuenta en sales/topServices).
    const cashRegister = await request(app.getHttpServer())
      .post('/api/v1/cash-register/open')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId, openingAmount: 0 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId,
        cashRegisterId: cashRegister.body.id,
        clientId,
        items: [{ itemType: 'service', serviceId, quantity: 1 }],
        payments: [{ method: 'cash', amount: 5000 }],
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /reports/dashboard devuelve ventas, turnos por estado y top servicios', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    expect(res.body.sales.count).toBe(1);
    expect(res.body.sales.totalRevenue).toBe(5000);
    expect(res.body.netRevenue).toBe(5000);
    expect(res.body.appointmentsByStatus).toContainEqual({ status: 'pending', count: 1 });
    expect(res.body.topServices[0]).toMatchObject({ name: 'Corte', subtotal: 5000, quantity: 1 });
  });

  it('GET /reports/dashboard respeta el rango from/to (fuera de rango no cuenta)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ from: '2020-01-01', to: '2020-01-02' })
      .expect(200);
    expect(res.body.sales.count).toBe(0);
  });

  it('GET /reports/sales/export?format=csv devuelve un CSV con la venta', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/sales/export')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ format: 'csv' })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Marta'); // cliente de la venta
    expect(res.text).toContain('5000');
    expect(res.text.split('\n').length).toBeGreaterThanOrEqual(2); // header + 1 fila
  });

  it('GET /reports/sales/export?format=xlsx devuelve un Excel válido', async () => {
    // superagent no reconoce el mime type de xlsx como binario por
    // default (a diferencia de application/pdf) — se fuerza un parser
    // binario para no perder el body en el parseo automático.
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/sales/export')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ format: 'xlsx' })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
    // Un .xlsx es un zip — empieza con la firma "PK".
    expect((res.body as Buffer).slice(0, 2).toString()).toBe('PK');
  });

  it('GET /reports/sales/export?format=pdf devuelve un PDF válido', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/sales/export')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ format: 'pdf' })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('GET /reports/appointments/export?format=csv devuelve el turno creado', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/appointments/export')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ format: 'csv' })
      .expect(200);
    expect(res.text).toContain('Corte');
    expect(res.text).toContain('pending');
  });

  it('un formato inválido en ?format= es rechazado por el DTO (400)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/sales/export')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ format: 'doc' });
    expect(res.status).toBe(400);
  });

  it('sin el permiso reportes.ver, el dashboard responde 403', async () => {
    const role = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Sin Reportes', permissionKeys: ['ventas.ver'] })
      .expect(201);

    const email = `sinreportes-${Date.now()}@${mainSlug}.com`;
    const password = 'SuperSecreta123!';
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        firstName: 'Sin',
        lastName: 'Reportes',
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
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('aislamiento multi-tenant: el dashboard de un negocio nuevo no ve la venta de otro', async () => {
    const other = await registerTenant(app, 'reports-other');
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    expect(res.body.sales.count).toBe(0);
    expect(res.body.sales.totalRevenue).toBe(0);
  });
});
