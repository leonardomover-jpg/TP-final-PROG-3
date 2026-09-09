import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

// Los demás *.spec.ts prueban cada módulo aislado (Ventas por su lado,
// Turnos por su lado, Reportes por su lado). Este archivo es distinto a
// propósito (Etapa 25, "testing end-to-end"): UN SOLO flujo, encadenado,
// que recorre el recorrido real de un negocio de punta a punta — sin login
// del cliente hasta el cierre de caja — y verifica que cada paso se vea
// reflejado correctamente en los pasos siguientes (el turno reservado sin
// login aparece como cliente del negocio; la venta descuenta stock; el
// dashboard y la auditoría reflejan todo lo anterior).

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

// 2026-03-02 es lunes (dayOfWeek=1) — mismo día usado en otros specs.
const MONDAY = '2026-03-02';

describe('Flujo end-to-end de un negocio real (Etapa 25)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let tenantSlug: string;
  let branchId: string;
  let professionalId: string;
  let serviceId: string;
  let productId: string;
  let appointmentId: string;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('recorre de punta a punta: alta del negocio -> configuración -> reserva pública -> venta -> caja -> reportes -> auditoría', async () => {
    // 1) Alta del negocio (crea tenant + sucursal principal + admin, todo en una transacción)
    tenantSlug = uniqueSlug('e2e-flow');
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Peluquería E2E',
        slug: tenantSlug,
        firstName: 'Admin',
        lastName: 'Negocio',
        email: `admin@${tenantSlug}.com`,
        password: 'SuperSecreta123!',
      })
      .expect(201);
    ownerToken = register.body.accessToken;

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    branchId = branches.body[0].id;

    // Producto/Inventario (Etapa 11) está gateado por el feature flag
    // "inventory" — el negocio necesita el plan Premium para usarlo, mismo
    // paso que hace cualquier negocio real antes de dar de alta productos.
    const platformAdmin = await createAndLoginPlatformAdmin(app, 'e2e-flow-admin');
    const plans = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/plans')
      .set('Authorization', `Bearer ${platformAdmin.accessToken}`)
      .expect(200);
    const premiumPlanId = plans.body.find((p: any) => p.name === 'Premium').id;
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${register.body.tenant.id}/plan`)
      .set('Authorization', `Bearer ${platformAdmin.accessToken}`)
      .send({ planId: premiumPlanId })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/feature-flags/inventory')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ enabled: true })
      .expect(200);

    // 2) Configuración: un profesional con horario semanal, un servicio
    //    habilitado para ese profesional, y un producto en stock.
    const professional = await request(app.getHttpServer())
      .post('/api/v1/professionals')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ firstName: 'Carla', lastName: 'Ruiz', commissionPercentage: 15 })
      .expect(201);
    professionalId = professional.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/professionals/${professionalId}/schedule`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entries: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }] })
      .expect(200);

    const service = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Corte', durationMinutes: 30, price: 5000 })
      .expect(201);
    serviceId = service.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/services/${serviceId}/professionals`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ professionalIds: [professionalId] })
      .expect(200);

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Shampoo', price: 3000, stock: 10 })
      .expect(201);
    productId = product.body.id;

    // 3) Un cliente reserva SIN LOGIN desde la página pública del negocio.
    const booking = await request(app.getHttpServer())
      .post(`/api/v1/public/${tenantSlug}/appointments`)
      .send({
        clientFirstName: 'Marta',
        clientLastName: 'Lopez',
        clientPhone: '+541122223333',
        branchId,
        professionalId,
        serviceId,
        startAt: `${MONDAY}T10:00:00.000Z`,
      })
      .expect(201);
    appointmentId = booking.body.id;
    expect(booking.body.status).toBe('pending');

    // 4) Ese cliente que se creó solo (sin login) ya es un cliente real del
    //    negocio, visible del lado autenticado.
    const clients = await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const client = clients.body.find((c: any) => c.phone === '+541122223333');
    expect(client).toBeDefined();
    clientId = client.id;

    // 5) El negocio confirma el turno.
    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(confirmed.body.status).toBe('confirmed');

    // 6) Se abre la caja y se registra la venta: el servicio del turno +
    //    un producto adicional, pago combinado.
    const cashRegister = await request(app.getHttpServer())
      .post('/api/v1/cash-register/open')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchId, openingAmount: 1000 })
      .expect(201);
    const cashRegisterId = cashRegister.body.id;

    const sale = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        branchId,
        cashRegisterId,
        clientId,
        professionalId,
        items: [
          { itemType: 'service', serviceId, quantity: 1 }, // 5000
          { itemType: 'product', productId, quantity: 1 }, // 3000
        ],
        payments: [
          { method: 'cash', amount: 5000 },
          { method: 'card', amount: 3000 },
        ],
      })
      .expect(201);
    expect(sale.body.total).toBe('8000');

    // El stock del producto vendido bajó de verdad.
    const productAfterSale = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(productAfterSale.body.stock).toBe(9);

    // 7) El turno se marca completado y se cierra la caja.
    await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/cash-register/${cashRegisterId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ closingAmount: 9000 })
      .expect(201);

    // 8) El dashboard refleja la venta y el turno recién hechos.
    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(dashboard.body.sales.count).toBe(1);
    expect(dashboard.body.sales.totalRevenue).toBe(8000);
    expect(dashboard.body.appointmentsByStatus).toContainEqual({ status: 'completed', count: 1 });

    // 9) Y la auditoría automática (AuditInterceptor, Etapa 22) dejó
    //    rastro de la venta, sin que ningún código de SalesController
    //    tuviera que escribirlo a mano.
    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({ entityType: 'sales' })
      .expect(200);
    expect(audit.body.items.length).toBeGreaterThanOrEqual(1);

    // 10) El servicio sigue reportándose saludable durante todo el flujo.
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
