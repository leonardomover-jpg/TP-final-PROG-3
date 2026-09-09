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

async function assignPlan(
  app: INestApplication,
  platformAdminToken: string,
  tenantId: string,
  planId: string,
) {
  await request(app.getHttpServer())
    .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
    .set('Authorization', `Bearer ${platformAdminToken}`)
    .send({ planId })
    .expect(200);
}

// Mismo helper que products/sales.spec.ts (Etapas 11/12): asigna Premium
// (lo incluye todo) y prende el flag "inventory" para ese negocio.
async function enableInventory(
  app: INestApplication,
  token: string,
  tenantId: string,
  platformAdminToken: string,
  premiumPlanId: string,
) {
  await assignPlan(app, platformAdminToken, tenantId, premiumPlanId);
  await request(app.getHttpServer())
    .patch('/api/v1/feature-flags/inventory')
    .set('Authorization', `Bearer ${token}`)
    .send({ enabled: true })
    .expect(200);
}

// POST /auth/register-tenant y POST /auth/login están limitados a 5
// llamadas/60s cada uno — mismo motivo que en archivos de tests anteriores:
// tres tenants (A: sin plan, B: Premium, C: objetivo de una comunicación
// "tenants") más un login de un empleado sin permisos, todo dentro del límite.
describe('Notificaciones: centro + canales internos (Etapa 14)', () => {
  let app: INestApplication;
  let platformAdminToken: string;
  let basicoPlanId: string;
  let premiumPlanId: string;
  let tenantA: { token: string; tenantId: string; slug: string };
  let tenantB: { token: string; tenantId: string; slug: string };
  let tenantC: { token: string; tenantId: string; slug: string };

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'notifications-admin');
    platformAdminToken = admin.accessToken;

    const plans = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/plans')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
    basicoPlanId = plans.body.find((p: any) => p.name === 'Básico').id; // maxUsers: 3
    premiumPlanId = plans.body.find((p: any) => p.name === 'Premium').id;

    tenantA = await registerTenant(app, 'notif-a');
    tenantB = await registerTenant(app, 'notif-b');
    tenantC = await registerTenant(app, 'notif-c');

    await enableInventory(app, tenantB.token, tenantB.tenantId, platformAdminToken, premiumPlanId);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Comunicaciones globales — consumo del lado negocio', () => {
    it('cada negocio ve solo las comunicaciones que le aplican según su audiencia', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/platform-admin/communications')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ title: 'Mantenimiento programado', body: 'El sistema estará en mantenimiento el domingo.', audienceType: 'all' })
        .expect(201);

      const forPremium = await request(app.getHttpServer())
        .post('/api/v1/platform-admin/communications')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ title: 'Nueva función Premium', body: 'Ya podés usar Reportes avanzados.', audienceType: 'plan', planId: premiumPlanId })
        .expect(201);

      const forTenantC = await request(app.getHttpServer())
        .post('/api/v1/platform-admin/communications')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ title: 'Aviso puntual', body: 'Mensaje solo para este negocio.', audienceType: 'tenants', tenantIds: [tenantC.tenantId] })
        .expect(201);

      const listA = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      const titlesA = listA.body.map((n: any) => n.title);
      expect(titlesA).toContain('Mantenimiento programado');
      expect(titlesA).not.toContain('Nueva función Premium');
      expect(titlesA).not.toContain('Aviso puntual');

      const listB = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      const titlesB = listB.body.map((n: any) => n.title);
      expect(titlesB).toContain('Mantenimiento programado');
      expect(titlesB).toContain('Nueva función Premium'); // tenantB tiene Premium
      expect(titlesB).not.toContain('Aviso puntual');

      const listC = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantC.token}`)
        .expect(200);
      const titlesC = listC.body.map((n: any) => n.title);
      expect(titlesC).toContain('Mantenimiento programado');
      expect(titlesC).not.toContain('Nueva función Premium'); // tenantC no tiene Premium
      expect(titlesC).toContain('Aviso puntual');

      const item = listC.body.find((n: any) => n.title === 'Aviso puntual');
      expect(item.source).toBe('communication');
      expect(item.readAt).toBeNull();
    });

    it('marcar una comunicación como leída actualiza el contador de no leídas, y no se puede marcar una que no aplica', async () => {
      const before = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      expect(before.body.count).toBeGreaterThanOrEqual(1);

      const list = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      const mantenimiento = list.body.find((n: any) => n.title === 'Mantenimiento programado');

      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/communications/${mantenimiento.id}/read`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      expect(after.body.count).toBe(before.body.count - 1);

      // tenantA no tiene Premium: no puede marcar como leída la comunicación de tenantB.
      const listB = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      const premiumComm = listB.body.find((n: any) => n.title === 'Nueva función Premium');
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/communications/${premiumComm.id}/read`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(404);
    });
  });

  describe('Stock bajo (Products + Sales)', () => {
    it('ProductsService.adjustStock avisa al cruzar el mínimo, y no repite el aviso si ya estaba bajo', async () => {
      const product = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ name: 'Tintura Rubio', price: 2000, stock: 10, minStock: 5 })
        .expect(201);
      const productId = product.body.id;

      const beforeCount = (
        await request(app.getHttpServer())
          .get('/api/v1/notifications')
          .set('Authorization', `Bearer ${tenantB.token}`)
          .expect(200)
      ).body.filter((n: any) => n.type === 'low_stock').length;

      // 10 -> 4: cruza el mínimo (5) por primera vez.
      await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/stock-adjustment`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ delta: -6, reason: 'Venta mostrador sin registrar' })
        .expect(201);

      const afterFirst = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      const lowStockNotifs = afterFirst.body.filter((n: any) => n.type === 'low_stock');
      expect(lowStockNotifs.length).toBe(beforeCount + 1);
      expect(lowStockNotifs[0].body).toContain('Tintura Rubio');

      // 4 -> 3: sigue bajo, pero YA estaba bajo — no debe generar un nuevo aviso.
      await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/stock-adjustment`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ delta: -1, reason: 'Rotura' })
        .expect(201);

      const afterSecond = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      expect(afterSecond.body.filter((n: any) => n.type === 'low_stock').length).toBe(beforeCount + 1);
    });

    it('SalesService.create avisa cuando una venta hace cruzar el mínimo de stock', async () => {
      const product = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ name: 'Shampoo Reparador', price: 3000, stock: 10, minStock: 5 })
        .expect(201);

      const branches = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      const branchId = branches.body[0].id;

      const cashRegister = await request(app.getHttpServer())
        .post('/api/v1/cash-register/open')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ branchId, openingAmount: 0 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({
          branchId,
          cashRegisterId: cashRegister.body.id,
          items: [{ itemType: 'product', productId: product.body.id, quantity: 6 }], // 10 -> 4
          payments: [{ method: 'cash', amount: 6 * 3000 }],
        })
        .expect(201);

      const notifs = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      expect(notifs.body.some((n: any) => n.type === 'low_stock' && n.body.includes('Shampoo Reparador'))).toBe(true);

      await request(app.getHttpServer())
        .post(`/api/v1/cash-register/${cashRegister.body.id}/close`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ closingAmount: 6 * 3000 })
        .expect(201);
    });

    it('solo avisa a usuarios con permiso inventario.gestionar, no a cualquier empleado', async () => {
      const password = 'SuperSecreta123!';
      const roles = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional'); // sin inventario.gestionar
      const branches = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      const employeeEmail = `sinpermisonotif-${Date.now()}@${tenantB.slug}.com`;

      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({
          firstName: 'Empleado',
          lastName: 'SinPermiso',
          email: employeeEmail,
          password,
          roleIds: [profesionalRole.id],
          branchIds: [branches.body[0].id],
        })
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantSlug: tenantB.slug, email: employeeEmail, password })
        .expect(200);

      const employeeNotifs = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(employeeNotifs.body.some((n: any) => n.type === 'low_stock')).toBe(false);
    });
  });

  describe('Aviso de límite de plan (75%/90%)', () => {
    it('avisa a los usuarios con suscripcion.gestionar al cruzar el 75%/90% del límite de usuarios', async () => {
      await assignPlan(app, platformAdminToken, tenantA.tenantId, basicoPlanId); // maxUsers: 3, ya tiene 1 (el admin)
      const password = 'SuperSecreta123!';
      const roles = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
      const branches = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      // 1 -> 2 de 3 (66%): no cruza ningún umbral todavía.
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          firstName: 'Segundo',
          lastName: 'Usuario',
          email: `segundo-${Date.now()}@${tenantA.slug}.com`,
          password,
          roleIds: [profesionalRole.id],
          branchIds: [branches.body[0].id],
        })
        .expect(201);

      const beforeThird = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      expect(beforeThird.body.some((n: any) => n.type === 'plan_limit_warning')).toBe(false);

      // 2 -> 3 de 3 (100%): cruza 75% y 90% de una — se avisa una sola vez, con el umbral más alto.
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          firstName: 'Tercero',
          lastName: 'Usuario',
          email: `tercero-${Date.now()}@${tenantA.slug}.com`,
          password,
          roleIds: [profesionalRole.id],
          branchIds: [branches.body[0].id],
        })
        .expect(201);

      const afterThird = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      const warnings = afterThird.body.filter((n: any) => n.type === 'plan_limit_warning');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].metadata.threshold).toBe(0.9);
    });
  });

  describe('Marcar notificación propia como leída + read-all', () => {
    it('marca una notificación de sistema como leída, y no puede marcar una que no es propia', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      const warning = list.body.find((n: any) => n.type === 'plan_limit_warning');
      expect(warning.readAt).toBeNull();

      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${warning.id}/read`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      const afterRead = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      expect(afterRead.body.find((n: any) => n.id === warning.id).readAt).not.toBeNull();

      // Tenant B no puede marcar como leída una notificación de Tenant A.
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${warning.id}/read`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(404);
    });

    it('read-all marca todo (notificaciones propias + comunicaciones aplicables) como leído', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);

      const unread = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      expect(unread.body.count).toBe(0);
    });
  });
});
