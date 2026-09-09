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

async function openRegister(app: INestApplication, token: string, branchId: string, openingAmount = 0) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/cash-register/open')
    .set('Authorization', `Bearer ${token}`)
    .send({ branchId, openingAmount })
    .expect(201);
  return res.body.id as string;
}

async function closeRegister(app: INestApplication, token: string, id: string, closingAmount = 0) {
  await request(app.getHttpServer())
    .post(`/api/v1/cash-register/${id}/close`)
    .set('Authorization', `Bearer ${token}`)
    .send({ closingAmount })
    .expect(201);
}

// Product (Etapa 11) está gateado por el feature flag "inventory" — hay
// que habilitarlo (plan Premium + PATCH /feature-flags) antes de poder
// crear el producto que usan las ventas mixtas de estos tests.
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
// por lado del test de aislamiento (3 llamadas en total). Habilitar
// "inventory" asigna el plan Premium (maxBranches: 5), así que los tests
// que necesitan una caja abierta reusan UNA sola sucursal (`registerBranchId`)
// y la cierran al final de cada uno, en vez de crear una sucursal por test.
describe('Ventas + Caja + Gastos + Comisiones (Etapa 12)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;
  let platformAdminToken: string;
  let registerBranchId: string;
  let professionalId: string;
  let serviceId: string;
  let productId: string;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'sales-inventory-admin');
    platformAdminToken = admin.accessToken;

    const main = await registerTenant(app, 'sale-main');
    mainToken = main.token;
    mainSlug = main.slug;
    await enableInventory(app, mainToken, main.tenantId, platformAdminToken);

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    registerBranchId = branches.body[0].id;

    const professional = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Carla', lastName: 'Ruiz', commissionPercentage: 20 })
      .expect(201);
    professionalId = professional.body.id;

    const service = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Corte', durationMinutes: 30, price: 5000 })
      .expect(201);
    serviceId = service.body.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Shampoo', price: 3000, stock: 10 })
      .expect(201);
    productId = product.body.id;

    const client = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Marta', lastName: 'Lopez' })
      .expect(201);
    clientId = client.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('no se puede vender sin una caja abierta en esa sucursal', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: registerBranchId,
        cashRegisterId: 'no-existe-esta-caja',
        items: [{ itemType: 'service', serviceId, quantity: 1 }],
        payments: [{ method: 'cash', amount: 5000 }],
      });
    expect(res.status).toBe(400);
  });

  it('no se puede abrir una segunda caja en la misma sucursal sin cerrar la anterior', async () => {
    const cashRegisterId = await openRegister(app, mainToken, registerBranchId, 1000);

    const res = await request(app.getHttpServer())
      .post('/api/v1/cash-register/open')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId: registerBranchId, openingAmount: 500 });
    expect(res.status).toBe(400);

    await closeRegister(app, mainToken, cashRegisterId, 1000);
  });

  it('venta mixta con pagos combinados: precio del catálogo (no del cliente), descuenta stock, calcula el total correcto', async () => {
    const cashRegisterId = await openRegister(app, mainToken, registerBranchId);

    const sale = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: registerBranchId,
        cashRegisterId,
        clientId,
        professionalId,
        items: [
          { itemType: 'service', serviceId, quantity: 1 }, // 5000, precio del catálogo (no se manda desde el cliente)
          { itemType: 'product', productId, quantity: 2 }, // 3000 x 2 = 6000
        ],
        payments: [
          { method: 'cash', amount: 5000 },
          { method: 'card', amount: 6000 },
        ],
      })
      .expect(201);
    expect(sale.body.total).toBe('11000');
    expect(sale.body.items).toHaveLength(2);
    expect(sale.body.payments).toHaveLength(2);

    const product = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(product.body.stock).toBe(8); // 10 - 2

    await closeRegister(app, mainToken, cashRegisterId, 5000);
  });

  it('rechaza una venta si los pagos no suman el total', async () => {
    const cashRegisterId = await openRegister(app, mainToken, registerBranchId);

    const res = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: registerBranchId,
        cashRegisterId,
        items: [{ itemType: 'service', serviceId, quantity: 1 }], // 5000
        payments: [{ method: 'cash', amount: 4000 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('pagos');

    await closeRegister(app, mainToken, cashRegisterId);
  });

  it('rechaza una venta con stock insuficiente', async () => {
    const cashRegisterId = await openRegister(app, mainToken, registerBranchId);

    const res = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: registerBranchId,
        cashRegisterId,
        items: [{ itemType: 'product', productId, quantity: 9999 }],
        payments: [{ method: 'cash', amount: 9999 * 3000 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Stock insuficiente');

    await closeRegister(app, mainToken, cashRegisterId);
  });

  it('cancelar una venta repone el stock de los productos vendidos', async () => {
    const cashRegisterId = await openRegister(app, mainToken, registerBranchId);

    const before = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    const sale = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: registerBranchId,
        cashRegisterId,
        items: [{ itemType: 'product', productId, quantity: 3 }],
        payments: [{ method: 'cash', amount: 9000 }],
      })
      .expect(201);

    const afterSale = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(afterSale.body.stock).toBe(before.body.stock - 3);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/sales/${sale.body.id}/cancel`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ reason: 'El cliente se arrepintió' })
      .expect(201);
    expect(cancelled.body.status).toBe('cancelled');

    const afterCancel = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(afterCancel.body.stock).toBe(before.body.stock); // repuesto

    // No se puede cancelar dos veces.
    await request(app.getHttpServer())
      .post(`/api/v1/sales/${sale.body.id}/cancel`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(400);

    await closeRegister(app, mainToken, cashRegisterId, 9000);
  });

  it('comisiones: solo sobre el subtotal de servicios de ventas completadas con profesional asignado', async () => {
    const cashRegisterId = await openRegister(app, mainToken, registerBranchId);

    await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: registerBranchId,
        cashRegisterId,
        professionalId,
        items: [
          { itemType: 'service', serviceId, quantity: 1 }, // 5000, comisiona
          { itemType: 'product', productId, quantity: 1 }, // 3000, NO comisiona
        ],
        payments: [{ method: 'cash', amount: 8000 }],
      })
      .expect(201);

    const commissions = await request(app.getHttpServer())
      .get('/api/v1/sales/commissions')
      .query({ professionalId })
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const entry = commissions.body.find((c: any) => c.professionalId === professionalId);
    expect(entry).toBeDefined();
    expect(entry.serviceSubtotal).toBeGreaterThanOrEqual(5000); // acumulado de corridas anteriores del mismo profesional
    expect(entry.commission).toBeCloseTo(entry.serviceSubtotal * 0.2, 2);

    await closeRegister(app, mainToken, cashRegisterId, 8000);
  });

  it('gastos: se pueden cargar a una caja abierta, y el cierre calcula el arqueo (efectivo esperado vs. contado)', async () => {
    const cashRegisterId = await openRegister(app, mainToken, registerBranchId, 1000);

    await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: registerBranchId,
        cashRegisterId,
        items: [{ itemType: 'service', serviceId, quantity: 1 }], // 5000 en efectivo
        payments: [{ method: 'cash', amount: 5000 }],
      })
      .expect(201);

    const expense = await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId: registerBranchId, cashRegisterId, category: 'insumos', amount: 800 })
      .expect(201);
    expect(expense.body.amount).toBe('800');

    // esperado = 1000 (apertura) + 5000 (venta en efectivo) - 800 (gasto) = 5200
    const closed = await request(app.getHttpServer())
      .post(`/api/v1/cash-register/${cashRegisterId}/close`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ closingAmount: 5150, notes: 'Faltaron $50' })
      .expect(201);
    expect(closed.body.expectedCashAmount).toBe('5200');
    expect(closed.body.difference).toBe('-50');
    expect(closed.body.status).toBe('closed');

    // Ya cerrada, no se le puede cargar otro gasto.
    await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId: registerBranchId, cashRegisterId, amount: 100 })
      .expect(400);
  });

  it('requiere los permisos ventas.crear/caja.abrir/gastos.crear — el rol "Profesional" no puede', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional'); // sin ventas.crear/caja.abrir/gastos.*
    const employeeEmail = `sinpermisoventas-${Date.now()}@${mainSlug}.com`;

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        firstName: 'Sin',
        lastName: 'Permiso',
        email: employeeEmail,
        password,
        roleIds: [profesionalRole.id],
        branchIds: [registerBranchId],
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: mainSlug, email: employeeEmail, password })
      .expect(200);
    const employeeToken = login.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/cash-register/open')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ branchId: registerBranchId, openingAmount: 0 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ amount: 100 })
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A no ve/accede a ventas, cajas ni gastos de Tenant B', async () => {
    const tenantA = await registerTenant(app, 'sale-tenant-a');
    const tenantB = await registerTenant(app, 'sale-tenant-b');

    const branchesB = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .expect(200);
    const branchB = branchesB.body[0].id;
    const cashRegisterIdB = await openRegister(app, tenantB.token, branchB);
    const serviceB = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Servicio de B', durationMinutes: 30, price: 1000 })
      .expect(201);
    const saleB = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({
        branchId: branchB,
        cashRegisterId: cashRegisterIdB,
        items: [{ itemType: 'service', serviceId: serviceB.body.id, quantity: 1 }],
        payments: [{ method: 'cash', amount: 1000 }],
      })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/sales')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.find((s: any) => s.id === saleB.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    // Tenant A no puede vender usando la caja/sucursal/servicio de Tenant B.
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({
        branchId: branchB,
        cashRegisterId: cashRegisterIdB,
        items: [{ itemType: 'service', serviceId: serviceB.body.id, quantity: 1 }],
        payments: [{ method: 'cash', amount: 1000 }],
      });
    expect(res.status).toBe(400);
  });
});
