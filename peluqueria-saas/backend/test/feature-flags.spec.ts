import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function registerTenant(app: INestApplication, slug: string) {
  const email = `admin@${slug}.com`;
  const password = 'SuperSecreta123!';
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register-tenant')
    .send({
      businessName: `Negocio ${slug}`,
      slug,
      firstName: 'Admin',
      lastName: 'Negocio',
      email,
      password,
    })
    .expect(201);
  return { accessToken: res.body.accessToken as string, tenantId: res.body.tenant.id as string };
}

describe('Feature Flags — jerarquía SUPER ADMIN → Plan → Negocio (Etapa 4)', () => {
  let app: INestApplication;
  let platformAdminToken: string;
  let basicoPlanId: string;
  let premiumPlanId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'flags-admin');
    platformAdminToken = admin.accessToken;

    const plans = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/plans')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
    basicoPlanId = plans.body.find((p: any) => p.name === 'Básico').id;
    premiumPlanId = plans.body.find((p: any) => p.name === 'Premium').id;
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('un negocio recién registrado (sin plan) ve todos los módulos como no disponibles', async () => {
    const { accessToken } = await registerTenant(app, uniqueSlug('sin-plan'));
    const res = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    for (const flag of res.body) {
      expect(flag.available).toBe(false);
      expect(flag.reason).toContain('plan');
    }
  });

  it('plan Básico no incluye "points" → el negocio no puede activarlo (punto 74 del pedido)', async () => {
    const { accessToken, tenantId } = await registerTenant(app, uniqueSlug('basico'));
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ planId: basicoPlanId })
      .expect(200);

    const flags = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const points = flags.body.find((f: any) => f.key === 'points');
    expect(points.available).toBe(false);
    expect(points.reason).toBe('Este módulo no está incluido en tu plan actual.');

    await request(app.getHttpServer())
      .patch('/api/v1/feature-flags/points')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: true })
      .expect(400);
  });

  it('plan Premium incluye "points" → el negocio puede activarlo y desactivarlo', async () => {
    const { accessToken, tenantId } = await registerTenant(app, uniqueSlug('premium'));
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ planId: premiumPlanId })
      .expect(200);

    const before = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const pointsBefore = before.body.find((f: any) => f.key === 'points');
    expect(pointsBefore.available).toBe(true);
    expect(pointsBefore.enabled).toBe(false); // disponible, pero el negocio no lo prendió todavía

    const enabled = await request(app.getHttpServer())
      .patch('/api/v1/feature-flags/points')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: true })
      .expect(200);
    expect(enabled.body.enabled).toBe(true);

    const disabled = await request(app.getHttpServer())
      .patch('/api/v1/feature-flags/points')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: false })
      .expect(200);
    expect(disabled.body.enabled).toBe(false);

    // La fila no se borra al desactivar (persiste con enabled=false) — se
    // puede volver a consultar y sigue apareciendo como "disponible".
    const after = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const pointsAfter = after.body.find((f: any) => f.key === 'points');
    expect(pointsAfter.available).toBe(true);
    expect(pointsAfter.enabled).toBe(false);
  });

  it('SUPER ADMIN deshabilita un flag global → ningún negocio puede usarlo aunque su plan lo incluya', async () => {
    const { accessToken, tenantId } = await registerTenant(app, uniqueSlug('premium-global-off'));
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ planId: premiumPlanId })
      .expect(200);

    // Confirmamos que "ai" está disponible antes de apagarlo globalmente.
    const before = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(before.body.find((f: any) => f.key === 'ai').available).toBe(true);

    const catalog = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/feature-flags')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
    const aiFlag = catalog.body.find((f: any) => f.key === 'ai');

    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/feature-flags/${aiFlag.id}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ globallyEnabled: false })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const aiAfter = after.body.find((f: any) => f.key === 'ai');
    expect(aiAfter.available).toBe(false);
    expect(aiAfter.reason).toBe('Este módulo fue deshabilitado por la plataforma.');

    await request(app.getHttpServer())
      .patch('/api/v1/feature-flags/ai')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: true })
      .expect(400);

    // Se revierte para no afectar otros tests que corren en la misma app.
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/feature-flags/${aiFlag.id}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ globallyEnabled: true })
      .expect(200);
  });

  it('SUPER ADMIN puede quitarle un módulo a un plan y el negocio deja de poder usarlo', async () => {
    const { accessToken, tenantId } = await registerTenant(app, uniqueSlug('plan-editado'));
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ planId: premiumPlanId })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/feature-flags/gift_cards')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: true })
      .expect(200);

    // SUPER ADMIN le saca "gift_cards" al plan Premium (deja todo el resto).
    const catalog = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/feature-flags')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
    const remainingKeys = catalog.body.map((f: any) => f.key).filter((k: string) => k !== 'gift_cards');

    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/plans/${premiumPlanId}/features`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ featureFlagKeys: remainingKeys })
      .expect(200);

    const flags = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(flags.body.find((f: any) => f.key === 'gift_cards').available).toBe(false);

    // Se restaura el plan Premium con todos los flags para no romper otros tests.
    const allKeys = catalog.body.map((f: any) => f.key);
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/plans/${premiumPlanId}/features`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ featureFlagKeys: allKeys })
      .expect(200);
  });
});
