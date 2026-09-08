import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'crypto';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function signWebhook(dataId: string, requestId: string) {
  const ts = Date.now().toString();
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET as string)
    .update(manifest)
    .digest('hex');
  return `ts=${ts},v1=${v1}`;
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

describe('Suscripciones + Mercado Pago (Etapa 5)', () => {
  let app: INestApplication;
  let platformAdminToken: string;
  let premiumPlanId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'subs-admin');
    platformAdminToken = admin.accessToken;

    const plans = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/plans')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
    premiumPlanId = plans.body.find((p: any) => p.name === 'Premium').id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  async function registerTenant(slug: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: `Negocio ${slug}`,
        slug,
        firstName: 'Admin',
        lastName: 'Negocio',
        email: `admin@${slug}.com`,
        password: 'SuperSecreta123!',
      })
      .expect(201);
    return { accessToken: res.body.accessToken as string, tenantId: res.body.tenant.id as string };
  }

  it('elegir un plan crea la suscripción en trial y sincroniza Tenant.planId', async () => {
    const { accessToken } = await registerTenant(uniqueSlug('select-plan'));

    const selected = await request(app.getHttpServer())
      .post('/api/v1/subscription/select-plan')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: premiumPlanId })
      .expect(201);
    expect(selected.body.status).toBe('trial');
    expect(selected.body.planId).toBe(premiumPlanId);

    // Tenant.planId sincronizado -> los feature flags del plan Premium ya están disponibles.
    const flags = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(flags.body.find((f: any) => f.key === 'points').available).toBe(true);
  });

  it('GET /subscription calcula daysRemaining y expiringSoon con la fecha del servidor', async () => {
    const { accessToken } = await registerTenant(uniqueSlug('dias-restantes'));
    await request(app.getHttpServer())
      .post('/api/v1/subscription/select-plan')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: premiumPlanId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/subscription')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.subscription.daysRemaining).toBeGreaterThanOrEqual(13);
    expect(res.body.subscription.daysRemaining).toBeLessThanOrEqual(14);
    expect(res.body.subscription.expiringSoon).toBe(false);

    // Se fuerza el vencimiento a 2 días para probar el umbral de "por vencer".
    await testPrisma.subscription.update({
      where: { id: res.body.subscription.id },
      data: { currentPeriodEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
    });

    const res2 = await request(app.getHttpServer())
      .get('/api/v1/subscription')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res2.body.subscription.expiringSoon).toBe(true);
  });

  it('el checkout llama a Mercado Pago y devuelve la URL de pago (mockeado)', async () => {
    const { accessToken } = await registerTenant(uniqueSlug('checkout'));
    await request(app.getHttpServer())
      .post('/api/v1/subscription/select-plan')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: premiumPlanId })
      .expect(201);

    const fetchMock = mockFetchOnce({
      id: 'pref-123',
      init_point: 'https://www.mercadopago.com/checkout/pref-123',
      sandbox_init_point: 'https://sandbox.mercadopago.com/checkout/pref-123',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscription/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(res.body.checkoutUrl).toBe('https://www.mercadopago.com/checkout/pref-123');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/checkout/preferences'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('un webhook con firma inválida se rechaza y no procesa nada', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/mercado-pago')
      .query({ 'data.id': 'pay-1', type: 'payment' })
      .set('x-signature', 'ts=123,v1=firma-truchada')
      .set('x-request-id', 'req-1')
      .expect(401);
  });

  it('flujo completo: checkout -> webhook aprobado -> suscripción activa, y el webhook duplicado no reprocesa', async () => {
    const { accessToken, tenantId } = await registerTenant(uniqueSlug('webhook-ok'));
    await request(app.getHttpServer())
      .post('/api/v1/subscription/select-plan')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ planId: premiumPlanId })
      .expect(201);

    const subscription = await testPrisma.subscription.findUnique({ where: { tenantId } });
    // dataId único por corrida: la idempotencia se garantiza por constraint
    // único en @@unique([provider, providerPaymentId]) — un valor fijo acá
    // colisionaría contra la fila insertada por una corrida anterior de este
    // mismo test contra una base de datos persistente (no se trunca entre
    // corridas), haciendo que el PRIMER POST ya devuelva "alreadyProcessed".
    const dataId = `payment-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const requestId = `req-${Date.now()}`;
    const xSignature = signWebhook(dataId, requestId);

    mockFetchOnce({
      id: dataId,
      status: 'approved',
      external_reference: subscription!.id,
      transaction_amount: 29999,
    });

    const first = await request(app.getHttpServer())
      .post('/api/v1/webhooks/mercado-pago')
      .query({ 'data.id': dataId, type: 'payment' })
      .set('x-signature', xSignature)
      .set('x-request-id', requestId)
      .expect(200);
    expect(first.body.processed).toBe(true);

    const updated = await testPrisma.subscription.findUnique({ where: { tenantId } });
    expect(updated?.status).toBe('active');
    expect(updated!.currentPeriodEnd.getTime()).toBeGreaterThan(subscription!.currentPeriodEnd.getTime());

    const payments = await testPrisma.subscriptionPayment.findMany({ where: { subscriptionId: subscription!.id } });
    expect(payments).toHaveLength(1);

    // Mercado Pago puede reenviar la misma notificación (punto 65 del
    // pedido) — el mismo dataId no debe duplicar el pago ni re-extender el período.
    mockFetchOnce({
      id: dataId,
      status: 'approved',
      external_reference: subscription!.id,
      transaction_amount: 29999,
    });
    const second = await request(app.getHttpServer())
      .post('/api/v1/webhooks/mercado-pago')
      .query({ 'data.id': dataId, type: 'payment' })
      .set('x-signature', signWebhook(dataId, requestId))
      .set('x-request-id', requestId)
      .expect(200);
    expect(second.body.alreadyProcessed).toBe(true);

    const paymentsAfter = await testPrisma.subscriptionPayment.findMany({
      where: { subscriptionId: subscription!.id },
    });
    expect(paymentsAfter).toHaveLength(1);
    const subAfterDuplicate = await testPrisma.subscription.findUnique({ where: { tenantId } });
    expect(subAfterDuplicate?.currentPeriodEnd.getTime()).toBe(updated!.currentPeriodEnd.getTime());
  });

  it('SUPER ADMIN ve las suscripciones de todos los negocios', async () => {
    const { tenantId } = await registerTenant(uniqueSlug('super-admin-view'));
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ planId: premiumPlanId })
      .expect(200);

    const subscription = await testPrisma.subscription.findUnique({ where: { tenantId } });

    // GET /:id en vez de depender de en qué página de la lista paginada cae
    // esta suscripción — en un ambiente de desarrollo con muchas
    // suscripciones de trial acumuladas de corridas anteriores, la posición
    // exacta no es determinística y no es lo que este test quiere probar.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/platform-admin/subscriptions/${subscription!.id}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
    expect(detail.body.tenantId).toBe(tenantId);
    expect(detail.body.tenant.id).toBe(tenantId);

    // La lista general (paginada) también debe responder con estructura
    // válida y sin filtrar entre negocios (mismo dominio de auth, no
    // multi-tenant scoping acá porque SUPER ADMIN ve todo a propósito).
    const list = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/subscriptions')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .query({ status: 'trial', limit: 100 })
      .expect(200);
    expect(Array.isArray(list.body.items)).toBe(true);
    expect(list.body.items.every((s: any) => s.status === 'trial')).toBe(true);
  });
});
