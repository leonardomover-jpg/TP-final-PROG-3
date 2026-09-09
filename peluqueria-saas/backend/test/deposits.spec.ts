import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'crypto';
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

function mockFetchOnce(body: unknown, ok = true) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce({
      ok,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response);
}

function signWebhook(webhookSecret: string, dataId: string, requestId: string) {
  const ts = Date.now().toString();
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', webhookSecret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

const TEST_ACCESS_TOKEN = 'TEST-tenant-access-token-1234567890';
const TEST_WEBHOOK_SECRET = 'tenant-webhook-secret-1234567890';

// 2026-03-02 es lunes (dayOfWeek=1) — mismo día usado en appointments.spec.ts.
const MONDAY = '2026-03-02';

// POST /auth/register-tenant limitado a 5/60s: un tenant "principal" (todo
// el flujo feliz de integración + señas) más un par para el test de
// aislamiento — 3 registros en total.
describe('Mercado Pago para clientes: integraciones + señas (Etapa 15)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainTenantId: string;
  let mainSlug: string;
  let branchId: string;
  let clientId: string;

  async function createAppointment(token: string, overrides: Partial<Record<string, string>> = {}) {
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const professional = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Carla', lastName: 'Ruiz' })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/professionals/${professional.body.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }] })
      .expect(200);
    const service = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corte', durationMinutes: 30, price: 5000 })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/v1/services/${service.body.id}/professionals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ professionalIds: [professional.body.id] })
      .expect(200);
    const client = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Marta', lastName: 'Lopez' })
      .expect(201);
    const appointment = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId: branches.body[0].id,
        professionalId: professional.body.id,
        clientId: client.body.id,
        serviceId: service.body.id,
        startAt: `${MONDAY}T10:00:00.000Z`,
        ...overrides,
      })
      .expect(201);
    return appointment.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'deposit-main');
    mainToken = main.token;
    mainTenantId = main.tenantId;
    mainSlug = main.slug;

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    branchId = branches.body[0].id;

    const client = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Cliente', lastName: 'Principal' })
      .expect(201);
    clientId = client.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Integraciones (Mercado Pago por negocio)', () => {
    it('rechaza conectar con un access token inválido, sin guardar nada', async () => {
      mockFetchOnce({ error: 'invalid token' }, false);
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations/mercado-pago/connect')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ accessToken: 'invalid-token', webhookSecret: TEST_WEBHOOK_SECRET });
      expect(res.status).toBe(400);

      const list = await request(app.getHttpServer())
        .get('/api/v1/integrations')
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(list.body.find((i: any) => i.provider === 'mercado_pago')).toBeUndefined();
    });

    it('conecta Mercado Pago con un access token válido, sin exponer los secretos', async () => {
      mockFetchOnce({ id: 'user-1' }, true); // GET /users/me OK
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations/mercado-pago/connect')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ accessToken: TEST_ACCESS_TOKEN, publicKey: 'pub-key-123', webhookSecret: TEST_WEBHOOK_SECRET })
        .expect(201);
      expect(res.body.status).toBe('connected');
      expect(res.body.publicKey).toBe('pub-key-123');
      expect(res.body.encryptedAccessToken).toBeUndefined();
      expect(res.body.encryptedWebhookSecret).toBeUndefined();

      const list = await request(app.getHttpServer())
        .get('/api/v1/integrations')
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      const mp = list.body.find((i: any) => i.provider === 'mercado_pago');
      expect(mp.status).toBe('connected');
      expect(mp.encryptedAccessToken).toBeUndefined();
    });
  });

  describe('Señas', () => {
    it('rechaza generar una seña para un turno inexistente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/deposits')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ appointmentId: 'no-existe-este-turno', amount: 1000 });
      expect(res.status).toBe(400);
    });

    it('genera una seña con el checkout de Mercado Pago del propio negocio, y rechaza una segunda para el mismo turno', async () => {
      const appointment = await createAppointment(mainToken);

      mockFetchOnce({
        id: 'pref-1',
        init_point: 'https://mp.example/checkout/pref-1',
        sandbox_init_point: 'https://mp.example/sandbox/pref-1',
      });
      const deposit = await request(app.getHttpServer())
        .post('/api/v1/deposits')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ appointmentId: appointment.id, amount: 1500 })
        .expect(201);
      expect(deposit.body.status).toBe('pending');
      expect(deposit.body.initPoint).toBe('https://mp.example/checkout/pref-1');

      const dup = await request(app.getHttpServer())
        .post('/api/v1/deposits')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ appointmentId: appointment.id, amount: 1500 });
      expect(dup.status).toBe(409);

      const listByAppointment = await request(app.getHttpServer())
        .get('/api/v1/deposits')
        .query({ appointmentId: appointment.id })
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(listByAppointment.body).toHaveLength(1);
    });

    it('el webhook confirma la seña con la firma del propio negocio, avisa una sola vez, y rechaza firma inválida', async () => {
      const appointment = await createAppointment(mainToken);
      mockFetchOnce({ id: 'pref-2', init_point: 'https://mp.example/checkout/pref-2', sandbox_init_point: 'https://mp.example/sandbox/pref-2' });
      const deposit = await request(app.getHttpServer())
        .post('/api/v1/deposits')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ appointmentId: appointment.id, amount: 2000 })
        .expect(201);

      const dataId = `payment-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
      const requestId = `req-${Date.now()}`;

      // Firma inválida: se rechaza y no confirma nada.
      const badSig = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/mercado-pago/tenant/${mainTenantId}`)
        .query({ 'data.id': dataId, type: 'payment' })
        .set('x-signature', 'ts=1,v1=deadbeef')
        .set('x-request-id', requestId);
      expect(badSig.status).toBe(401);

      mockFetchOnce({ id: dataId, status: 'approved', external_reference: deposit.body.id, transaction_amount: 2000 });
      const first = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/mercado-pago/tenant/${mainTenantId}`)
        .query({ 'data.id': dataId, type: 'payment' })
        .set('x-signature', signWebhook(TEST_WEBHOOK_SECRET, dataId, requestId))
        .set('x-request-id', requestId)
        .expect(200);
      expect(first.body.processed).toBe(true);

      const afterFirst = await request(app.getHttpServer())
        .get(`/api/v1/deposits/${deposit.body.id}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(afterFirst.body.status).toBe('approved');

      // Reenvío del mismo dataId: no reprocesa, no duplica el aviso.
      mockFetchOnce({ id: dataId, status: 'approved', external_reference: deposit.body.id, transaction_amount: 2000 });
      const second = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/mercado-pago/tenant/${mainTenantId}`)
        .query({ 'data.id': dataId, type: 'payment' })
        .set('x-signature', signWebhook(TEST_WEBHOOK_SECRET, dataId, requestId))
        .set('x-request-id', requestId)
        .expect(200);
      expect(second.body.alreadyProcessed).toBe(true);

      const notifications = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      const depositNotifs = notifications.body.filter((n: any) => n.type === 'deposit_approved');
      expect(depositNotifs).toHaveLength(1);
    });

    it('un webhook para un tenant sin Mercado Pago conectado se ignora (200, sin procesar)', async () => {
      const other = await registerTenant(app, 'deposit-noconn');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/mercado-pago/tenant/${other.tenantId}`)
        .query({ 'data.id': 'x', type: 'payment' })
        .set('x-signature', 'ts=1,v1=deadbeef')
        .set('x-request-id', 'req-x')
        .expect(200);
      expect(res.body.ignored).toBe(true);
    });
  });

  it('requiere integraciones.gestionar/senas.gestionar — el rol "Profesional" no puede', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
    const employeeEmail = `sinpermisodeposits-${Date.now()}@${mainSlug}.com`;

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        firstName: 'Sin',
        lastName: 'Permiso',
        email: employeeEmail,
        password,
        roleIds: [profesionalRole.id],
        branchIds: [branchId],
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: mainSlug, email: employeeEmail, password })
      .expect(200);
    const employeeToken = login.body.accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/integrations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ appointmentId: 'x', amount: 100 })
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A no ve/accede a integraciones ni señas de Tenant B, ni puede generar una seña con un turno de Tenant B', async () => {
    const tenantA = await registerTenant(app, 'deposit-tenant-a');
    const tenantB = await registerTenant(app, 'deposit-tenant-b');

    mockFetchOnce({ id: 'user-b' }, true);
    await request(app.getHttpServer())
      .post('/api/v1/integrations/mercado-pago/connect')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ accessToken: 'tenant-b-token-1234567890', webhookSecret: 'tenant-b-webhook-secret-123' })
      .expect(201);

    const appointmentB = await createAppointment(tenantB.token);
    mockFetchOnce({ id: 'pref-b', init_point: 'https://mp.example/checkout/pref-b', sandbox_init_point: 'https://mp.example/sandbox/pref-b' });
    const depositB = await request(app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ appointmentId: appointmentB.id, amount: 1000 })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/deposits')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.find((d: any) => d.id === depositB.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/deposits/${depositB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    // Tenant A no puede generar una seña usando el turno de Tenant B.
    const res = await request(app.getHttpServer())
      .post('/api/v1/deposits')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ appointmentId: appointmentB.id, amount: 1000 });
    expect(res.status).toBe(400);
  });
});
