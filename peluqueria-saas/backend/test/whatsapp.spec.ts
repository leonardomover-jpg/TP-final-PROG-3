import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'crypto';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin } from './helpers/platform-admin';

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

async function enableWhatsAppFlag(
  app: INestApplication,
  token: string,
  tenantId: string,
  platformAdminToken: string,
) {
  const plans = await request(app.getHttpServer())
    .get('/api/v1/platform-admin/plans')
    .set('Authorization', `Bearer ${platformAdminToken}`)
    .expect(200);
  const premiumPlanId = plans.body.find((p: any) => p.name === 'Premium').id;

  await request(app.getHttpServer())
    .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
    .set('Authorization', `Bearer ${platformAdminToken}`)
    .send({ planId: premiumPlanId })
    .expect(200);

  await request(app.getHttpServer())
    .patch('/api/v1/feature-flags/whatsapp')
    .set('Authorization', `Bearer ${token}`)
    .send({ enabled: true })
    .expect(200);
}

const TEST_ACCESS_TOKEN = 'EAAtest-whatsapp-access-token-1234567890';
const TEST_PHONE_NUMBER_ID = '109876543210987';
const TEST_APP_SECRET = 'tenant-whatsapp-app-secret-1234567890';
const TEST_VERIFY_TOKEN = 'tenant-chosen-verify-token';

// 2026-03-02 es lunes (dayOfWeek=1) — mismo día usado en appointments.spec.ts.
const MONDAY = '2026-03-02';

function signWhatsAppBody(appSecret: string, rawBody: string) {
  return 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
}

// POST /auth/register-tenant limitado a 5/60s: un tenant "principal" (todo
// el flujo feliz) más uno para el test de aislamiento — 2 registros en
// total, dentro del límite.
describe('WhatsApp (Meta Cloud API): conexión + avisos + webhook (Etapa 16)', () => {
  let app: INestApplication;
  let platformAdminToken: string;
  let mainToken: string;
  let mainTenantId: string;
  let mainSlug: string;
  let branchId: string;
  let professionalId: string;
  let serviceId: string;

  async function createAppointment(clientPhone: string | null, dayOffsetMinutes = 0) {
    const client = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Cliente', lastName: 'WhatsApp', ...(clientPhone && { phone: clientPhone }) })
      .expect(201);
    const appointment = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId,
        professionalId,
        clientId: client.body.id,
        serviceId,
        startAt: `${MONDAY}T${String(10 + Math.floor(dayOffsetMinutes / 60)).padStart(2, '0')}:${String(dayOffsetMinutes % 60).padStart(2, '0')}:00.000Z`,
      })
      .expect(201);
    return appointment.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'whatsapp-admin');
    platformAdminToken = admin.accessToken;

    const main = await registerTenant(app, 'wa-main');
    mainToken = main.token;
    mainTenantId = main.tenantId;
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
  });

  it('sin el feature flag "whatsapp" habilitado, conectar la cuenta responde 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/integrations/whatsapp/connect')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        accessToken: TEST_ACCESS_TOKEN,
        phoneNumberId: TEST_PHONE_NUMBER_ID,
        appSecret: TEST_APP_SECRET,
        verifyToken: TEST_VERIFY_TOKEN,
      });
    expect(res.status).toBe(403);
  });

  it('confirmar/cancelar un turno funciona igual aunque WhatsApp no esté conectado (best-effort, nunca rompe el flujo)', async () => {
    const appointment = await createAppointment('+5491100000001', 0);
    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointment.id}/confirm`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(201);
    expect(confirmed.body.status).toBe('confirmed');

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointment.id}/cancel`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ reason: 'Cambio de planes' })
      .expect(201);
    expect(cancelled.body.status).toBe('cancelled');
  });

  it('rechaza el recordatorio manual si WhatsApp no está conectado', async () => {
    const appointment = await createAppointment('+5491100000002', 30);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointment.id}/send-reminder`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send();
    expect(res.status).toBe(400);
  });

  describe('con el flag habilitado', () => {
    beforeAll(async () => {
      await enableWhatsAppFlag(app, mainToken, mainTenantId, platformAdminToken);
    });

    it('rechaza conectar con credenciales inválidas, sin guardar nada', async () => {
      mockFetchOnce({ error: 'invalid' }, false);
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations/whatsapp/connect')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({
          accessToken: 'invalid-token-1234567890',
          phoneNumberId: TEST_PHONE_NUMBER_ID,
          appSecret: TEST_APP_SECRET,
          verifyToken: TEST_VERIFY_TOKEN,
        });
      expect(res.status).toBe(400);
    });

    it('conecta WhatsApp con credenciales válidas, sin exponer los secretos', async () => {
      mockFetchOnce({ id: TEST_PHONE_NUMBER_ID }, true);
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations/whatsapp/connect')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({
          accessToken: TEST_ACCESS_TOKEN,
          phoneNumberId: TEST_PHONE_NUMBER_ID,
          appSecret: TEST_APP_SECRET,
          verifyToken: TEST_VERIFY_TOKEN,
        })
        .expect(201);
      expect(res.body.status).toBe('connected');
      expect(res.body.phoneNumberId).toBe(TEST_PHONE_NUMBER_ID);
      expect(res.body.encryptedAccessToken).toBeUndefined();
      expect(res.body.encryptedWebhookSecret).toBeUndefined();
      expect(res.body.encryptedVerifyToken).toBeUndefined();
    });

    it('confirmar un turno envía el mensaje de WhatsApp real', async () => {
      const appointment = await createAppointment('+5491100000003', 60);
      const fetchSpy = mockFetchOnce({ messages: [{ id: 'wamid.OUT1' }] });
      await request(app.getHttpServer())
        .post(`/api/v1/appointments/${appointment.id}/confirm`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(201);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/${TEST_PHONE_NUMBER_ID}/messages`),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('el recordatorio manual envía el mensaje y responde sent:true', async () => {
      const appointment = await createAppointment('+5491100000004', 90);
      mockFetchOnce({ messages: [{ id: 'wamid.OUT2' }] });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/appointments/${appointment.id}/send-reminder`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send()
        .expect(201);
      expect(res.body.sent).toBe(true);
    });

    it('rechaza el recordatorio si el cliente no tiene teléfono cargado', async () => {
      const appointment = await createAppointment(null, 120);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/appointments/${appointment.id}/send-reminder`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send();
      expect(res.status).toBe(400);
    });

    describe('webhook por tenant', () => {
      it('el handshake GET responde el challenge con el verify token correcto, y rechaza uno incorrecto', async () => {
        const ok = await request(app.getHttpServer())
          .get(`/api/v1/webhooks/whatsapp/tenant/${mainTenantId}`)
          .query({ 'hub.mode': 'subscribe', 'hub.verify_token': TEST_VERIFY_TOKEN, 'hub.challenge': 'challenge-123' })
          .expect(200);
        expect(ok.text).toBe('challenge-123');

        await request(app.getHttpServer())
          .get(`/api/v1/webhooks/whatsapp/tenant/${mainTenantId}`)
          .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'challenge-123' })
          .expect(403);
      });

      it('un mensaje entrante con firma válida avisa al staff, y una firma inválida se rechaza', async () => {
        const payload = JSON.stringify({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [{ from: '5491155556666', id: 'wamid.IN1', text: { body: 'Hola, quiero sacar un turno' } }],
                  },
                },
              ],
            },
          ],
        });

        const bad = await request(app.getHttpServer())
          .post(`/api/v1/webhooks/whatsapp/tenant/${mainTenantId}`)
          .set('Content-Type', 'application/json')
          .set('x-hub-signature-256', 'sha256=deadbeef')
          .send(payload);
        expect(bad.status).toBe(401);

        const good = await request(app.getHttpServer())
          .post(`/api/v1/webhooks/whatsapp/tenant/${mainTenantId}`)
          .set('Content-Type', 'application/json')
          .set('x-hub-signature-256', signWhatsAppBody(TEST_APP_SECRET, payload))
          .send(payload)
          .expect(200);
        expect(good.body.processed).toBe(true);

        const notifications = await request(app.getHttpServer())
          .get('/api/v1/notifications')
          .set('Authorization', `Bearer ${mainToken}`)
          .expect(200);
        expect(notifications.body.some((n: any) => n.type === 'whatsapp_message' && n.body.includes('quiero sacar un turno'))).toBe(
          true,
        );
      });
    });

    it('requiere integraciones.gestionar/turnos.editar — el rol "Profesional" no puede', async () => {
      const password = 'SuperSecreta123!';
      const roles = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
      const employeeEmail = `sinpermisowhatsapp-${Date.now()}@${mainSlug}.com`;

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
        .post('/api/v1/integrations/whatsapp/connect')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          accessToken: TEST_ACCESS_TOKEN,
          phoneNumberId: TEST_PHONE_NUMBER_ID,
          appSecret: TEST_APP_SECRET,
          verifyToken: TEST_VERIFY_TOKEN,
        })
        .expect(403);
    });
  });

  it('aislamiento multi-tenant: la integración de WhatsApp y el webhook de Tenant A no afectan a Tenant B', async () => {
    const tenantB = await registerTenant(app, 'wa-tenant-b');

    // Tenant B no tiene el flag habilitado ni WhatsApp conectado — un
    // webhook dirigido a su tenantId se ignora, nunca usa las credenciales
    // de Tenant A por error.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/whatsapp/tenant/${tenantB.tenantId}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=irrelevante')
      .send(JSON.stringify({ entry: [] }));
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/v1/integrations')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .expect(200);
    expect(list.body.find((i: any) => i.provider === 'whatsapp')).toBeUndefined();
  });
});
