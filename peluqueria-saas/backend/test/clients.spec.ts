import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';
import { createAndLoginPlatformAdmin, testPrisma } from './helpers/platform-admin';

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

// POST /auth/register-tenant y POST /auth/login están limitados a 5
// llamadas/60s cada uno (auth.controller.ts, doc 04 §2 — anti brute force).
// Ese límite se comparte entre TODOS los tests de este archivo (una sola
// instancia de la app, un solo storage en memoria), así que se minimiza a
// propósito la cantidad de negocios registrados: un tenant "principal"
// reusado por los tests que no necesitan aislamiento entre negocios, más
// uno por cada lado de la comparación en el test de aislamiento y uno para
// el test de límite de plan (4 llamadas a register-tenant en total).
describe('Clientes / CRM (Etapa 6)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainSlug: string;

  beforeAll(async () => {
    app = await createTestApp();
    const main = await registerTenant(app, 'clientes-main');
    mainToken = main.token;
    mainSlug = main.slug;
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  it('CRUD básico: crear, listar, ver ficha, editar y soft delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Juana', lastName: 'Pérez', phone: '1122334455', email: 'juana@example.com' })
      .expect(201);
    expect(created.body.id).toBeDefined();
    expect(created.body.status).toBe('active');

    const list = await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(list.body.find((c: any) => c.id === created.body.id)).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/clients/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    // Ficha: datos personales + notas (vacío acá) + placeholder de historial
    // (Etapa 6, sin Turnos/Ventas/Puntos todavía — se completa en etapas futuras).
    expect(detail.body.firstName).toBe('Juana');
    expect(detail.body.notesHistory).toEqual([]);
    expect(detail.body.history).toEqual({ appointments: [], sales: [], loyaltyPoints: null });

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/clients/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ phone: '9988776655' })
      .expect(200);
    expect(updated.body.phone).toBe('9988776655');

    await request(app.getHttpServer())
      .delete(`/api/v1/clients/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    // Soft delete: desaparece del listado activo...
    const listAfterDelete = await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(listAfterDelete.body.find((c: any) => c.id === created.body.id)).toBeUndefined();

    // ...pero la fila y su historial siguen existiendo en la base (punto 97 del pedido).
    const stillInDb = await testPrisma.client.findUnique({ where: { id: created.body.id } });
    expect(stillInDb).not.toBeNull();
    expect(stillInDb?.deletedAt).not.toBeNull();

    // Y GET /:id ya no lo encuentra (tratado como no encontrado, igual que Users/Branches).
    await request(app.getHttpServer())
      .get(`/api/v1/clients/${created.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(404);
  });

  it('no exige unicidad de email/teléfono entre clientes (a diferencia de User)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Cliente', lastName: 'Uno', phone: '5555555555' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Cliente', lastName: 'Dos', phone: '5555555555' })
      .expect(201);
  });

  it('notas internas: agregar y listar, con autor y fecha', async () => {
    const client = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ firstName: 'Con', lastName: 'Notas' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/clients/${client.body.id}/notes`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ body: 'Prefiere turnos por la tarde.' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/clients/${client.body.id}/notes`)
      .set('Authorization', `Bearer ${mainToken}`)
      .send({ body: 'Alérgica a la tintura X.' })
      .expect(201);

    const notes = await request(app.getHttpServer())
      .get(`/api/v1/clients/${client.body.id}/notes`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(notes.body).toHaveLength(2);
    expect(notes.body[0].authorId).toBeDefined();
    expect(notes.body[0].createdAt).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/clients/${client.body.id}`)
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    expect(detail.body.notesHistory).toHaveLength(2);
  });

  it('requiere el permiso clientes.crear — un rol sin ese permiso no puede crear clientes', async () => {
    const password = 'SuperSecreta123!';
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);
    // "Profesional" tiene clientes.ver pero no clientes.crear/editar/eliminar (seed).
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');
    const employeeEmail = `sinpermiso-${Date.now()}@${mainSlug}.com`;

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

    // Puede ver clientes (clientes.ver sí está en el rol Profesional)...
    await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    // ...pero no puede crear uno (sin clientes.crear).
    await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ firstName: 'Intento', lastName: 'Fallido' })
      .expect(403);
  });

  it('aislamiento multi-tenant: Tenant A no ve/edita/borra clientes de Tenant B ni por id directo', async () => {
    const tenantA = await registerTenant(app, 'clientes-tenant-a');
    const tenantB = await registerTenant(app, 'clientes-tenant-b');

    const clientB = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ firstName: 'Cliente', lastName: 'DeB' })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(listA.body.find((c: any) => c.id === clientB.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/clients/${clientB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ firstName: 'Hackeado' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/clients/${clientB.body.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);

    // Tampoco puede leer ni agregar notas del cliente ajeno.
    await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientB.body.id}/notes`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientB.body.id}/notes`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ body: 'Intento ajeno' })
      .expect(404);
  });

  it('el límite de plan (maxClients) bloquea crear un cliente de más', async () => {
    const platformAdmin = await createAndLoginPlatformAdmin(app, 'clients-limit-admin');
    const smallPlan = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/plans')
      .set('Authorization', `Bearer ${platformAdmin.accessToken}`)
      .send({
        name: `Mini Clientes ${Date.now()}`,
        price: 100,
        billingPeriod: 'monthly',
        maxUsers: 10,
        maxProfessionals: 10,
        maxBranches: 5,
        maxClients: 2,
      })
      .expect(201);

    const { token, tenantId } = await registerTenant(app, 'limite-clientes');
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/plan`)
      .set('Authorization', `Bearer ${platformAdmin.accessToken}`)
      .send({ planId: smallPlan.body.id })
      .expect(200);

    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: `Cliente${i}`, lastName: 'Limite' })
        .expect(201);
    }

    const planInfo = await request(app.getHttpServer())
      .get('/api/v1/plan')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const clientsUsage = planInfo.body.usage.find((u: any) => u.resource === 'clients');
    expect(clientsUsage.current).toBe(2);
    expect(clientsUsage.max).toBe(2);

    const res = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Tercero', lastName: 'Bloqueado' });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('límite');
  });
});
