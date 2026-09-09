import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

// Igual que enableInventory() en sales.spec.ts (Etapa 12): asigna el plan
// Premium (lo incluye todo) y prende, uno por uno, los flags que este
// archivo necesita — la jerarquía SUPER ADMIN → Plan → Negocio exige las
// dos escrituras (el plan solo habilita "disponible", el PATCH lo prende).
async function enableFeatures(
  app: INestApplication,
  token: string,
  tenantId: string,
  platformAdminToken: string,
  keys: string[],
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

  for (const key of keys) {
    await request(app.getHttpServer())
      .patch(`/api/v1/feature-flags/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true })
      .expect(200);
  }
}

// POST /auth/register-tenant y POST /auth/login están limitados a 5
// llamadas/60s cada uno (mismo motivo que en archivos de tests anteriores):
// un tenant "sin flags" (gating), un tenant "principal" reusado por todo lo
// demás, y un par para el test de aislamiento — 4 registros en total.
describe('Fidelización: Puntos + Gift Cards + Referidos + Promociones (Etapa 13)', () => {
  let app: INestApplication;
  let platformAdminToken: string;
  let mainToken: string;
  let mainSlug: string;
  let clientAId: string;
  let clientBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'loyalty-admin');
    platformAdminToken = admin.accessToken;

    const main = await registerTenant(app, 'loyalty-main');
    mainToken = main.token;
    mainSlug = main.slug;
    await enableFeatures(app, mainToken, main.tenantId, platformAdminToken, [
      'points',
      'gift_cards',
      'referrals',
      'promotions',
    ]);

    const clientA = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Ana', lastName: 'Perez' })
      .expect(201);
    clientAId = clientA.body.id;

    const clientB = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Beto', lastName: 'Gomez' })
      .expect(201);
    clientBId = clientB.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin el feature flag habilitado, ningún endpoint de fidelización responde', async () => {
    const noFlags = await registerTenant(app, 'loyalty-noflags');

    await request(app.getHttpServer())
      .get(`/api/v1/points/balance/${clientAId}`)
      .set('Authorization', `Bearer ${noFlags.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/gift-cards')
      .set('Authorization', `Bearer ${noFlags.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/referrals')
      .set('Authorization', `Bearer ${noFlags.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/promotions')
      .set('Authorization', `Bearer ${noFlags.token}`)
      .expect(403);
  });

  describe('Puntos', () => {
    it('otorga puntos, consulta el saldo y lo lista en el ledger', async () => {
      const award = await request(app.getHttpServer())
        .post('/api/v1/points/award')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ clientId: clientAId, amount: 100, reason: 'Bienvenida' })
        .expect(201);
      expect(award.body.delta).toBe(100);

      const balance = await request(app.getHttpServer())
        .get(`/api/v1/points/balance/${clientAId}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(balance.body.balance).toBe(100);

      const transactions = await request(app.getHttpServer())
        .get('/api/v1/points/transactions')
        .query({ clientId: clientAId })
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(transactions.body.length).toBeGreaterThanOrEqual(1);
    });

    it('canjea puntos y descuenta del saldo', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/points/redeem')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ clientId: clientAId, amount: 40, reason: 'Descuento en corte' })
        .expect(201);

      const balance = await request(app.getHttpServer())
        .get(`/api/v1/points/balance/${clientAId}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(balance.body.balance).toBe(60);
    });

    it('rechaza canjear más puntos de los que el cliente tiene', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/points/redeem')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ clientId: clientAId, amount: 999999, reason: 'Imposible' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Saldo insuficiente');
    });
  });

  describe('Gift Cards', () => {
    it('emite una gift card con código autogenerado', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/gift-cards')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ initialBalance: 5000 })
        .expect(201);
      expect(res.body.code).toBeTruthy();
      expect(res.body.balance).toBe('5000');
      expect(res.body.status).toBe('active');
    });

    it('emite una gift card con código propio y rechaza un duplicado', async () => {
      const code = `PROMO-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/api/v1/gift-cards')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ code, initialBalance: 1000, clientId: clientAId })
        .expect(201);

      const dup = await request(app.getHttpServer())
        .post('/api/v1/gift-cards')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ code, initialBalance: 2000 });
      expect(dup.status).toBe(409);
    });

    it('canjea saldo parcial, rechaza canjear de más y cierra la tarjeta al llegar a 0', async () => {
      const issued = await request(app.getHttpServer())
        .post('/api/v1/gift-cards')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ initialBalance: 1000 })
        .expect(201);
      const giftCardId = issued.body.id;

      const overRedeem = await request(app.getHttpServer())
        .post(`/api/v1/gift-cards/${giftCardId}/redeem`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ amount: 2000, reason: 'Demasiado' });
      expect(overRedeem.status).toBe(400);

      const partial = await request(app.getHttpServer())
        .post(`/api/v1/gift-cards/${giftCardId}/redeem`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ amount: 400, reason: 'Corte' })
        .expect(201);
      expect(partial.body.amount).toBe('-400');

      const afterPartial = await request(app.getHttpServer())
        .get(`/api/v1/gift-cards/${giftCardId}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(afterPartial.body.balance).toBe('600');
      expect(afterPartial.body.status).toBe('active');
      expect(afterPartial.body.transactions).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/api/v1/gift-cards/${giftCardId}/redeem`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ amount: 600, reason: 'Resto' })
        .expect(201);

      const afterFull = await request(app.getHttpServer())
        .get(`/api/v1/gift-cards/${giftCardId}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(afterFull.body.balance).toBe('0');
      expect(afterFull.body.status).toBe('redeemed');

      // Ya no admite más canjes, ni siquiera de $0 relevante.
      const afterClosed = await request(app.getHttpServer())
        .post(`/api/v1/gift-cards/${giftCardId}/redeem`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ amount: 1, reason: 'No debería andar' });
      expect(afterClosed.status).toBe(400);
    });

    it('cancela una gift card activa y ya no admite canjes ni cancelarla de nuevo', async () => {
      const issued = await request(app.getHttpServer())
        .post('/api/v1/gift-cards')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ initialBalance: 2000 })
        .expect(201);
      const giftCardId = issued.body.id;

      const cancelled = await request(app.getHttpServer())
        .post(`/api/v1/gift-cards/${giftCardId}/cancel`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(201);
      expect(cancelled.body.status).toBe('cancelled');

      await request(app.getHttpServer())
        .post(`/api/v1/gift-cards/${giftCardId}/redeem`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ amount: 100, reason: 'No debería andar' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/gift-cards/${giftCardId}/cancel`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(400);
    });

    it('rechaza canjear una gift card vencida', async () => {
      const issued = await request(app.getHttpServer())
        .post('/api/v1/gift-cards')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ initialBalance: 500, expiresAt: '2020-01-01T00:00:00.000Z' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/gift-cards/${issued.body.id}/redeem`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ amount: 100, reason: 'Vencida' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('vencida');
    });
  });

  describe('Referidos', () => {
    it('registra un referido, lo completa y acredita los puntos de recompensa al referente', async () => {
      const before = await request(app.getHttpServer())
        .get(`/api/v1/points/balance/${clientAId}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);

      const referral = await request(app.getHttpServer())
        .post('/api/v1/referrals')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ referrerClientId: clientAId, referredClientId: clientBId, rewardPoints: 50 })
        .expect(201);
      expect(referral.body.status).toBe('pending');

      const completed = await request(app.getHttpServer())
        .post(`/api/v1/referrals/${referral.body.id}/complete`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(201);
      expect(completed.body.status).toBe('completed');

      const after = await request(app.getHttpServer())
        .get(`/api/v1/points/balance/${clientAId}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(after.body.balance).toBe(before.body.balance + 50);

      // No se puede completar dos veces.
      await request(app.getHttpServer())
        .post(`/api/v1/referrals/${referral.body.id}/complete`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(400);
    });

    it('rechaza referir al mismo cliente que se referencia a sí mismo, y un referido duplicado', async () => {
      const selfRefer = await request(app.getHttpServer())
        .post('/api/v1/referrals')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ referrerClientId: clientAId, referredClientId: clientAId });
      expect(selfRefer.status).toBe(400);

      // clientB ya fue referido en el test anterior -> unique [tenantId, referredClientId].
      const dup = await request(app.getHttpServer())
        .post('/api/v1/referrals')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ referrerClientId: clientAId, referredClientId: clientBId });
      expect(dup.status).toBe(409);
    });
  });

  describe('Promociones', () => {
    it('CRUD de promociones, con código único por negocio', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ name: 'Verano 2026', code: 'VERANO26', discountType: 'percentage', discountValue: 15 })
        .expect(201);
      expect(created.body.status).toBe('active');

      const dup = await request(app.getHttpServer())
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ name: 'Otra', code: 'VERANO26', discountType: 'fixed', discountValue: 500 });
      expect(dup.status).toBe(409);

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/promotions/${created.body.id}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .send({ discountValue: 20 })
        .expect(200);
      expect(updated.body.discountValue).toBe('20');

      await request(app.getHttpServer())
        .delete(`/api/v1/promotions/${created.body.id}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);

      const afterRemove = await request(app.getHttpServer())
        .get(`/api/v1/promotions/${created.body.id}`)
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);
      expect(afterRemove.body.status).toBe('inactive');
    });
  });

  it('requiere los permisos *.gestionar — el rol "Profesional" no puede otorgar puntos ni emitir gift cards', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
    const employeeEmail = `sinpermisoloyalty-${Date.now()}@${mainSlug}.com`;

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

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
      .post('/api/v1/points/award')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ clientId: clientAId, amount: 10, reason: 'No debería poder' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/gift-cards')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ initialBalance: 100 })
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A no ve/accede a puntos, gift cards, referidos ni promociones de Tenant B', async () => {
    const tenantA = await registerTenant(app, 'loyalty-tenant-a');
    const tenantB = await registerTenant(app, 'loyalty-tenant-b');
    await enableFeatures(app, tenantB.token, tenantB.tenantId, platformAdminToken, [
      'points',
      'gift_cards',
      'referrals',
      'promotions',
    ]);

    const clientB1 = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ firstName: 'Cliente', lastName: 'DeB' })
      .expect(201);

    const giftCardB = await request(app.getHttpServer())
      .post('/api/v1/gift-cards')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ initialBalance: 1000 })
      .expect(201);

    const promotionB = await request(app.getHttpServer())
      .post('/api/v1/promotions')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Promo de B', discountType: 'fixed', discountValue: 100 })
      .expect(201);

    // Tenant A no está habilitado para estos módulos, y aunque lo estuviera
    // nunca debería ver filas de otro tenant.
    await enableFeatures(app, tenantA.token, tenantA.tenantId, platformAdminToken, [
      'points',
      'gift_cards',
      'promotions',
    ]);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/gift-cards')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.find((g: any) => g.id === giftCardB.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/gift-cards/${giftCardB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    const promoListA = await request(app.getHttpServer())
      .get('/api/v1/promotions')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(promoListA.body.find((p: any) => p.id === promotionB.body.id)).toBeUndefined();

    // Tenant A no puede otorgar puntos a un cliente de Tenant B.
    const res = await request(app.getHttpServer())
      .post('/api/v1/points/award')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ clientId: clientB1.body.id, amount: 10, reason: 'No debería andar' });
    expect(res.status).toBe(404);
  });
});
