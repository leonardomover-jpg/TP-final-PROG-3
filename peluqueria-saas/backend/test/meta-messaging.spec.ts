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

async function enableFlags(app: INestApplication, token: string, tenantId: string, platformAdminToken: string, flags: string[]) {
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

  for (const flag of flags) {
    await request(app.getHttpServer())
      .patch(`/api/v1/feature-flags/${flag}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true })
      .expect(200);
  }
}

function signMetaBody(appSecret: string, rawBody: string) {
  return 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
}

const CREDS: Record<'facebook' | 'instagram', { accessToken: string; externalAccountId: string; appSecret: string; verifyToken: string }> = {
  facebook: {
    accessToken: 'EAAtest-facebook-access-token-1234567890',
    externalAccountId: 'fb-page-id-12345',
    appSecret: 'facebook-app-secret-1234567890',
    verifyToken: 'facebook-chosen-verify-token',
  },
  instagram: {
    accessToken: 'EAAtest-instagram-access-token-1234567890',
    externalAccountId: 'ig-account-id-67890',
    appSecret: 'instagram-app-secret-1234567890',
    verifyToken: 'instagram-chosen-verify-token',
  },
};

// POST /auth/register-tenant limitado a 5/60s: un tenant "principal" (todo
// el flujo feliz para ambos providers) más uno para el test de
// aislamiento — 2 registros en total.
describe('Facebook / Instagram (Meta Graph API): conexión + mensajería + webhook (Etapa 17)', () => {
  let app: INestApplication;
  let platformAdminToken: string;
  let mainToken: string;
  let mainTenantId: string;
  let mainSlug: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'meta-messaging-admin');
    platformAdminToken = admin.accessToken;

    const main = await registerTenant(app, 'meta-main');
    mainToken = main.token;
    mainTenantId = main.tenantId;
    mainSlug = main.slug;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin los feature flags "facebook"/"instagram" habilitados, conectar responde 403', async () => {
    for (const provider of ['facebook', 'instagram'] as const) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/integrations/${provider}/connect`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send(CREDS[provider]);
      expect(res.status).toBe(403);
    }
  });

  it('responder un mensaje rechaza si el provider no está conectado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/meta-messaging/reply')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ provider: 'facebook', recipientId: 'psid-123', message: 'Hola!' });
    expect(res.status).toBe(400);
  });

  describe('con los flags habilitados', () => {
    beforeAll(async () => {
      await enableFlags(app, mainToken, mainTenantId, platformAdminToken, ['facebook', 'instagram']);
    });

    describe.each(['facebook', 'instagram'] as const)('%s', (provider) => {
      const creds = CREDS[provider];

      it('rechaza conectar con credenciales inválidas, sin guardar nada', async () => {
        mockFetchOnce({ error: 'invalid' }, false);
        const res = await request(app.getHttpServer())
          .post(`/api/v1/integrations/${provider}/connect`)
          .set('Authorization', `Bearer ${mainToken}`)
          .send(creds);
        expect(res.status).toBe(400);
      });

      it('conecta con credenciales válidas, sin exponer los secretos', async () => {
        mockFetchOnce({ id: creds.externalAccountId }, true);
        const res = await request(app.getHttpServer())
          .post(`/api/v1/integrations/${provider}/connect`)
          .set('Authorization', `Bearer ${mainToken}`)
          .send(creds)
          .expect(201);
        expect(res.body.status).toBe('connected');
        expect(res.body.externalAccountId).toBe(creds.externalAccountId);
        expect(res.body.encryptedAccessToken).toBeUndefined();
        expect(res.body.encryptedWebhookSecret).toBeUndefined();
        expect(res.body.encryptedVerifyToken).toBeUndefined();
      });

      it('responder un mensaje envía el mensaje real', async () => {
        const fetchSpy = mockFetchOnce({ message_id: `mid.${provider}.OUT1` });
        const res = await request(app.getHttpServer())
          .post('/api/v1/meta-messaging/reply')
          .set('Authorization', `Bearer ${mainToken}`)
          .send({ provider, recipientId: 'recipient-123', message: 'Gracias por tu mensaje!' })
          .expect(201);
        expect(res.body.sent).toBe(true);
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining(`/${creds.externalAccountId}/messages`),
          expect.objectContaining({ method: 'POST' }),
        );
      });

      it('el handshake GET del webhook responde el challenge con el verify token correcto, y rechaza uno incorrecto', async () => {
        const ok = await request(app.getHttpServer())
          .get(`/api/v1/webhooks/${provider}/tenant/${mainTenantId}`)
          .query({ 'hub.mode': 'subscribe', 'hub.verify_token': creds.verifyToken, 'hub.challenge': `challenge-${provider}` })
          .expect(200);
        expect(ok.text).toBe(`challenge-${provider}`);

        await request(app.getHttpServer())
          .get(`/api/v1/webhooks/${provider}/tenant/${mainTenantId}`)
          .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': `challenge-${provider}` })
          .expect(403);
      });

      it('un mensaje entrante con firma válida avisa al staff, y una firma inválida se rechaza', async () => {
        const payload = JSON.stringify({
          object: provider === 'facebook' ? 'page' : 'instagram',
          entry: [
            {
              messaging: [
                { sender: { id: `sender-${provider}-1` }, message: { mid: `mid.${provider}.IN1`, text: `Hola desde ${provider}` } },
              ],
            },
          ],
        });

        const bad = await request(app.getHttpServer())
          .post(`/api/v1/webhooks/${provider}/tenant/${mainTenantId}`)
          .set('Content-Type', 'application/json')
          .set('x-hub-signature-256', 'sha256=deadbeef')
          .send(payload);
        expect(bad.status).toBe(401);

        const good = await request(app.getHttpServer())
          .post(`/api/v1/webhooks/${provider}/tenant/${mainTenantId}`)
          .set('Content-Type', 'application/json')
          .set('x-hub-signature-256', signMetaBody(creds.appSecret, payload))
          .send(payload)
          .expect(200);
        expect(good.body.processed).toBe(true);

        const notifications = await request(app.getHttpServer())
          .get('/api/v1/notifications')
          .set('Authorization', `Bearer ${mainToken}`)
          .expect(200);
        expect(
          notifications.body.some((n: any) => n.type === `${provider}_message` && n.body.includes(`Hola desde ${provider}`)),
        ).toBe(true);
      });
    });

    it('requiere integraciones.gestionar/mensajes.gestionar — el rol "Profesional" no puede', async () => {
      const password = 'SuperSecreta123!';
      const roles = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
      const branches = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      const employeeEmail = `sinpermisometa-${Date.now()}@${mainSlug}.com`;

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
        .post('/api/v1/integrations/facebook/connect')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send(CREDS.facebook)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/meta-messaging/reply')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ provider: 'facebook', recipientId: 'x', message: 'x' })
        .expect(403);
    });
  });

  it('aislamiento multi-tenant: un webhook dirigido a un tenant sin la integración conectada se ignora, nunca usa credenciales de otro negocio', async () => {
    const tenantB = await registerTenant(app, 'meta-tenant-b');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/facebook/tenant/${tenantB.tenantId}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=irrelevante')
      .send(JSON.stringify({ object: 'page', entry: [] }));
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/v1/integrations')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .expect(200);
    expect(list.body.find((i: any) => i.provider === 'facebook' || i.provider === 'instagram')).toBeUndefined();
  });
});
