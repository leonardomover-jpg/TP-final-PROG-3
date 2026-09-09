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

// Habilita el feature flag "inventory" para un tenant: asignarle el plan
// Premium (el único de los dos sembrados que lo incluye) y después
// prenderlo desde el propio negocio — ejercita la jerarquía completa
// SUPER ADMIN → Plan → Negocio (Etapa 4) de punta a punta, primer
// consumidor real del FeatureFlagGuard construido en esa etapa.
async function enableInventory(
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
    .patch('/api/v1/feature-flags/inventory')
    .set('Authorization', `Bearer ${token}`)
    .send({ enabled: true })
    .expect(200);
}

// POST /auth/register-tenant y POST /auth/login están limitados a 5
// llamadas/60s cada uno — mismo motivo y estrategia de minimizar registros
// que en los archivos de tests anteriores: un tenant "principal" reusado
// por todos los tests que no necesitan aislamiento entre negocios, más uno
// por lado del test de aislamiento (3 llamadas en total).
describe('Productos e Inventario (Etapa 11)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainTenantId: string;
  let mainSlug: string;
  let platformAdminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'inventory-admin');
    platformAdminToken = admin.accessToken;

    const main = await registerTenant(app, 'inv-main');
    mainToken = main.token;
    mainTenantId = main.tenantId;
    mainSlug = main.slug;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin el feature flag "inventory" habilitado, el módulo entero responde 403', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(403);
  });

  it('habilita el feature flag "inventory" (Premium + activado por el negocio)', async () => {
    await enableInventory(app, mainToken, mainTenantId, platformAdminToken);

    const flags = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const inventoryFlag = flags.body.find((f: any) => f.key === 'inventory');
    expect(inventoryFlag.available).toBe(true);
    expect(inventoryFlag.enabled).toBe(true);
  });

  it('CRUD de productos: crear, listar, ver, editar, sku duplicado rechazado, soft delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Shampoo 500ml', sku: 'SH-500', price: 4500, stock: 10, minStock: 3 })
      .expect(201);
    expect(created.body.stock).toBe(10);

    const duplicateSku = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Otro producto', sku: 'SH-500', price: 1000 });
    expect(duplicateSku.status).toBe(409);

    const list = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(list.body.find((p: any) => p.id === created.body.id)).toBeDefined();

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/products/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ price: 5000 })
      .expect(200);
    expect(updated.body.price).toBe('5000');

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    const listAfterDelete = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(listAfterDelete.body.find((p: any) => p.id === created.body.id)).toBeUndefined();
  });

  it('ajuste manual de stock: incrementa, decrementa, y rechaza dejar el stock negativo', async () => {
    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Tijera', price: 8000, stock: 5, minStock: 2 })
      .expect(201);

    const increased = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.body.id}/stock-adjustment`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ delta: 3, reason: 'Conteo de inventario encontró más stock' })
      .expect(201);
    expect(increased.body.stock).toBe(8);

    const decreased = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.body.id}/stock-adjustment`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ delta: -2, reason: 'Rotura' })
      .expect(201);
    expect(decreased.body.stock).toBe(6);

    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.body.id}/stock-adjustment`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ delta: -100, reason: 'Ajuste imposible' });
    expect(rejected.status).toBe(400);
  });

  it('alerta de stock mínimo: ?lowStock=true filtra productos con stock <= minStock', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Producto bajo mínimo', price: 100, stock: 1, minStock: 5 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Producto con stock de sobra', price: 100, stock: 50, minStock: 5 })
      .expect(201);

    const lowStock = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ lowStock: 'true' })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(lowStock.body.every((p: any) => p.stock <= p.minStock)).toBe(true);
    expect(lowStock.body.find((p: any) => p.name === 'Producto bajo mínimo')).toBeDefined();
    expect(lowStock.body.find((p: any) => p.name === 'Producto con stock de sobra')).toBeUndefined();
  });

  it('proveedores: CRUD completo', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Distribuidora Beauty', contactName: 'Juan', phone: '1122334455' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/suppliers/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ contactName: 'Juana' })
      .expect(200);
    expect(updated.body.contactName).toBe('Juana');

    await request(app.getHttpServer())
      .delete(`/api/v1/suppliers/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(list.body.find((s: any) => s.id === created.body.id)).toBeUndefined();
  });

  it('flujo completo de compra: crear (no toca stock) -> recibir (incrementa stock y actualiza costo) -> no se puede recibir/cancelar dos veces', async () => {
    const supplier = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Proveedor de la compra' })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Producto a comprar', price: 3000, stock: 5 })
      .expect(201);

    const purchase = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        supplierId: supplier.body.id,
        items: [{ productId: product.body.id, quantity: 20, unitCost: 1200 }],
      })
      .expect(201);
    expect(purchase.body.status).toBe('pending');

    const stillFive = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(stillFive.body.stock).toBe(5); // pending no toca stock

    const received = await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.body.id}/receive`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(201);
    expect(received.body.status).toBe('received');

    const afterReceive = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(afterReceive.body.stock).toBe(25); // 5 + 20
    expect(afterReceive.body.cost).toBe('1200');

    await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.body.id}/receive`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.body.id}/cancel`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(400);
  });

  it('cancelar una compra pendiente no toca el stock, y no se puede recibir después de cancelada', async () => {
    const supplier = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Proveedor a cancelar' })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Producto no comprado', price: 500, stock: 2 })
      .expect(201);

    const purchase = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ supplierId: supplier.body.id, items: [{ productId: product.body.id, quantity: 10, unitCost: 100 }] })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.body.id}/cancel`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(201);
    expect(cancelled.body.status).toBe('cancelled');

    const stillTwo = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(stillTwo.body.stock).toBe(2);

    await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.body.id}/receive`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(400);
  });

  it('requiere el permiso productos.gestionar/inventario.gestionar — el rol "Profesional" no puede', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional'); // sin productos.*/inventario.*
    const employeeEmail = `sinpermisoinventario-${Date.now()}@${mainSlug}.com`;

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
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A (sin inventory habilitado) no ve productos/proveedores/compras de Tenant B', async () => {
    const tenantA = await registerTenant(app, 'inv-tenant-a');
    const tenantB = await registerTenant(app, 'inv-tenant-b');
    await enableInventory(app, tenantB.token, tenantB.tenantId, platformAdminToken);

    const productB = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Producto de B', price: 1000 })
      .expect(201);

    // Tenant A ni siquiera tiene el feature flag habilitado — 403, no 404 ni 200.
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(403);

    // Aunque se le habilite el feature flag a Tenant A, sigue sin ver los
    // productos de Tenant B (aislamiento de datos, no solo de features).
    await enableInventory(app, tenantA.token, tenantA.tenantId, platformAdminToken);
    const listA = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.find((p: any) => p.id === productB.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/products/${productB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);
  });
});
