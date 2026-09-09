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

// Habilita "inventory" (Premium + flag propio) — mismo helper que
// test/products.spec.ts. Se llama DESPUÉS de crear la 2da sucursal/rol/
// usuario en el beforeAll, para no interferir con el supuesto "sin plan =
// sin límite" que usan esas altas.
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

const MONDAY = '2026-03-02';

// POST /auth/register-tenant y POST /auth/login están limitados a 5/60s:
// un solo tenant (registro) + un solo login (el usuario de sucursal) en
// todo el archivo.
describe('Sucursales — permisos por sucursal + inventario por sucursal (Etapa 19)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainTenantId: string;
  let mainSlug: string;
  let branchA: string; // sucursal principal, asignada al usuario de sucursal
  let branchB: string; // segunda sucursal, NO asignada
  let staffToken: string;
  let professionalId: string;
  let serviceId: string;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'branches-admin');

    const main = await registerTenant(app, 'branches-main');
    mainToken = main.token;
    mainTenantId = main.tenantId;
    mainSlug = main.slug;

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    branchA = branches.body[0].id;

    const branchBRes = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Sucursal Sur' })
      .expect(201);
    branchB = branchBRes.body.id;

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

    // Rol custom SIN sucursales.todas: solo los permisos operativos que
    // necesitan los tests de abajo (turnos/ventas/caja/clientes/productos).
    const role = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        name: 'Staff Sucursal',
        permissionKeys: [
          'turnos.ver',
          'turnos.crear',
          'ventas.ver',
          'ventas.crear',
          'caja.ver',
          'caja.abrir',
          'clientes.ver',
          'clientes.crear',
          'productos.gestionar',
        ],
      })
      .expect(201);

    const staffEmail = `staff-${Date.now()}@branches-main.com`;
    const staffPassword = 'SuperSecreta123!';
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        firstName: 'Staff',
        lastName: 'Sucursal',
        email: staffEmail,
        password: staffPassword,
        roleIds: [role.body.id],
        branchIds: [branchA], // asignado SOLO a branchA
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: mainSlug, email: staffEmail, password: staffPassword })
      .expect(200);
    staffToken = login.body.accessToken;

    await enableInventory(app, mainToken, mainTenantId, admin.accessToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('un usuario asignado solo a una sucursal no puede crear turnos en OTRA sucursal (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchId: branchB, professionalId, clientId, serviceId, startAt: `${MONDAY}T10:00:00.000Z` });
    expect(res.status).toBe(403);
  });

  it('el mismo usuario SÍ puede crear turnos en la sucursal a la que está asignado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchId: branchA, professionalId, clientId, serviceId, startAt: `${MONDAY}T10:00:00.000Z` });
    expect(res.status).toBe(201);
  });

  it('el dueño (permiso sucursales.todas) puede operar en cualquier sucursal sin estar asignado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId: branchB, professionalId, clientId, serviceId, startAt: `${MONDAY}T11:00:00.000Z` });
    expect(res.status).toBe(201);
  });

  it('lista de espera: mismo criterio de sucursal que turnos', async () => {
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/waitlist')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchId: branchB, clientId, serviceId });
    expect(blocked.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .post('/api/v1/waitlist')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchId: branchA, clientId, serviceId });
    expect(allowed.status).toBe(201);
  });

  it('caja: abrir en sucursal no asignada rechaza (403), en la asignada abre (201)', async () => {
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/cash-register/open')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchId: branchB, openingAmount: 1000 });
    expect(blocked.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .post('/api/v1/cash-register/open')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchId: branchA, openingAmount: 1000 });
    expect(allowed.status).toBe(201);
  });

  it('ventas: crear en sucursal no asignada rechaza antes de tocar el service (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        branchId: branchB,
        cashRegisterId: 'no-existe',
        items: [{ itemType: 'service', serviceId, quantity: 1 }],
        payments: [{ method: 'cash', amount: 5000 }],
      });
    expect(res.status).toBe(403);
  });

  it('inventario por sucursal: un producto exclusivo de una sucursal no se puede vender desde otra', async () => {
    const productA = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Shampoo Exclusivo A', price: 3000, stock: 10, branchId: branchA })
      .expect(201);

    const cashB = await request(app.getHttpServer())
      .post('/api/v1/cash-register/open')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ branchId: branchB, openingAmount: 1000 })
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: branchB,
        cashRegisterId: cashB.body.id,
        items: [{ itemType: 'product', productId: productA.body.id, quantity: 1 }],
        payments: [{ method: 'cash', amount: 3000 }],
      });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toContain('otra sucursal');

    // Desde branchA (la sucursal del producto) sí funciona — reusa la caja
    // que el test de "caja: abrir" ya dejó abierta ahí.
    const cashRegistersA = await request(app.getHttpServer())
      .get('/api/v1/cash-register')
      .set('Authorization', `Bearer ${staffToken}`)
      .query({ branchId: branchA })
      .expect(200);
    const openInA = cashRegistersA.body.find((c: any) => c.status === 'open');

    const allowed = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        branchId: branchA,
        cashRegisterId: openInA.id,
        items: [{ itemType: 'product', productId: productA.body.id, quantity: 1 }],
        payments: [{ method: 'cash', amount: 3000 }],
      });
    expect(allowed.status).toBe(201);
  });

  it('inventario por sucursal: un producto compartido (sin branchId) se puede vender desde cualquier sucursal', async () => {
    const shared = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Shampoo Compartido', price: 2000, stock: 10 })
      .expect(201);
    expect(shared.body.branchId).toBeNull();

    const cashRegisters = await request(app.getHttpServer())
      .get('/api/v1/cash-register')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ branchId: branchB })
      .expect(200);
    const openInB = cashRegisters.body.find((c: any) => c.status === 'open');

    const sale = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({
        branchId: branchB,
        cashRegisterId: openInB.id,
        items: [{ itemType: 'product', productId: shared.body.id, quantity: 1 }],
        payments: [{ method: 'cash', amount: 2000 }],
      });
    expect(sale.status).toBe(201);
  });

  it('GET /products?branchId= devuelve los de esa sucursal + los compartidos, no los de otra sucursal puntual', async () => {
    const productB = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ name: 'Shampoo Exclusivo B', price: 3000, stock: 5, branchId: branchB })
      .expect(201);

    const listForA = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${mainToken}`)
      .query({ branchId: branchA })
      .expect(200);

    const ids = listForA.body.map((p: any) => p.id);
    expect(ids).not.toContain(productB.body.id);
  });
});
