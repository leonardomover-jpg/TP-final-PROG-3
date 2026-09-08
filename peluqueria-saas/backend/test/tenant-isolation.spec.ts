import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';

// El test más importante de todo el sistema multi-tenant (doc
// 04-SEGURIDAD-BASELINE §10, punto 73/74 del pedido original):
// "Tenant A intentando acceder a Tenant B" debe fallar, siempre.
describe('Aislamiento multi-tenant (Etapa 2)', () => {
  let app: INestApplication;
  const password = 'SuperSecreta123!';

  let tenantAAccessToken: string;
  let tenantBAccessToken: string;
  let userIdInTenantB: string;
  let roleIdInTenantB: string;

  function uniqueSlug(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  beforeAll(async () => {
    app = await createTestApp();
    const server = app.getHttpServer();

    const tenantA = await request(server)
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Barbería A',
        slug: uniqueSlug('tenant-a'),
        firstName: 'Admin',
        lastName: 'AA',
        email: 'admin@tenant-a.com',
        password,
      })
      .expect(201);
    tenantAAccessToken = tenantA.body.accessToken;

    const tenantB = await request(server)
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Peluquería B',
        slug: uniqueSlug('tenant-b'),
        firstName: 'Admin',
        lastName: 'BB',
        email: 'admin@tenant-b.com',
        password,
      })
      .expect(201);
    tenantBAccessToken = tenantB.body.accessToken;

    // Un segundo usuario y un rol propio dentro del Tenant B, para intentar
    // alcanzarlos después desde el Tenant A.
    const branchesB = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tenantBAccessToken}`)
      .expect(200);
    const rolesB = await request(server)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${tenantBAccessToken}`)
      .expect(200);
    const adminRoleB = rolesB.body.find((r: any) => r.name === 'Administrador del negocio');

    const newUserB = await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tenantBAccessToken}`)
      .send({
        firstName: 'Empleado',
        lastName: 'DeB',
        email: 'empleado@tenant-b.com',
        password,
        roleIds: [adminRoleB.id],
        branchIds: [branchesB.body[0].id],
      })
      .expect(201);
    userIdInTenantB = newUserB.body.id;

    const customRoleB = await request(server)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${tenantBAccessToken}`)
      .send({ name: 'Rol propio de B', permissionKeys: ['clientes.ver'] })
      .expect(201);
    roleIdInTenantB = customRoleB.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Tenant A no ve usuarios de Tenant B al listar (GET /users)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tenantAAccessToken}`)
      .expect(200);

    const leaked = res.body.find((u: any) => u.id === userIdInTenantB);
    expect(leaked).toBeUndefined();
  });

  it('Tenant A no puede leer un usuario de Tenant B por id directo (IDOR)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/users/${userIdInTenantB}`)
      .set('Authorization', `Bearer ${tenantAAccessToken}`)
      .expect(404);
  });

  it('Tenant A no puede editar un usuario de Tenant B por id directo', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${userIdInTenantB}`)
      .set('Authorization', `Bearer ${tenantAAccessToken}`)
      .send({ firstName: 'Hackeado' })
      .expect(404);
  });

  it('Tenant A no puede eliminar un usuario de Tenant B por id directo', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/users/${userIdInTenantB}`)
      .set('Authorization', `Bearer ${tenantAAccessToken}`)
      .expect(404);
  });

  it('Tenant A no ve el rol propio de Tenant B al listar (GET /roles)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${tenantAAccessToken}`)
      .expect(200);

    const leaked = res.body.find((r: any) => r.id === roleIdInTenantB);
    expect(leaked).toBeUndefined();
  });

  it('Tenant A no puede editar el rol propio de Tenant B', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/roles/${roleIdInTenantB}`)
      .set('Authorization', `Bearer ${tenantAAccessToken}`)
      .send({ name: 'Hackeado' })
      .expect(404);
  });

  it('Tenant A no puede eliminar el rol propio de Tenant B', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/roles/${roleIdInTenantB}`)
      .set('Authorization', `Bearer ${tenantAAccessToken}`)
      .expect(404);
  });

  it('un token de Tenant A nunca devuelve datos de Tenant B aunque las respuestas se comparen entre sí', async () => {
    const usersA = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tenantAAccessToken}`)
      .expect(200);
    const usersB = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tenantBAccessToken}`)
      .expect(200);

    const idsA = new Set(usersA.body.map((u: any) => u.id));
    const idsB = new Set(usersB.body.map((u: any) => u.id));
    const intersection = [...idsA].filter((id) => idsB.has(id));
    expect(intersection).toHaveLength(0);
  });
});
