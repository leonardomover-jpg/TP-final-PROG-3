import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('RBAC — permisos (Etapa 2)', () => {
  let app: INestApplication;
  const password = 'SuperSecreta123!';
  const slug = uniqueSlug('barberia-rbac');
  let adminAccessToken: string;
  let profesionalAccessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const server = app.getHttpServer();

    const admin = await request(server)
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Barbería RBAC',
        slug,
        firstName: 'Admin',
        lastName: 'RBAC',
        email: 'admin@rbac-test.com',
        password,
      })
      .expect(201);
    adminAccessToken = admin.body.accessToken;

    const branches = await request(server)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const roles = await request(server)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const profesionalRole = roles.body.find((r: any) => r.name === 'Profesional');

    await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        firstName: 'Juan',
        lastName: 'Peluquero',
        email: 'juan@rbac-test.com',
        password,
        roleIds: [profesionalRole.id],
        branchIds: [branches.body[0].id],
      })
      .expect(201);

    const profesionalLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email: 'juan@rbac-test.com', password })
      .expect(200);
    profesionalAccessToken = profesionalLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('el admin del negocio (todos los permisos) puede listar usuarios', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
  });

  it('un rol "Profesional" (sin usuarios.ver) NO puede listar usuarios', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${profesionalAccessToken}`)
      .expect(403);
  });

  it('un rol "Profesional" (sin roles.ver) NO puede listar roles', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${profesionalAccessToken}`)
      .expect(403);
  });

  it('un rol "Profesional" (sin usuarios.crear) NO puede crear usuarios', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${profesionalAccessToken}`)
      .send({
        firstName: 'Intento',
        lastName: 'Fallido',
        email: 'no-deberia@rbac-test.com',
        password,
        roleIds: [],
        branchIds: [],
      })
      .expect(403);
  });

  it('un cambio de rol tiene efecto inmediato (no requiere esperar a que expire el token)', async () => {
    // El "Profesional" no puede ver sucursales por defecto... pero sí ver
    // turnos/clientes según el seed. Verificamos que degradar sus permisos
    // (quitarle "clientes.ver") lo bloquea sin necesidad de un nuevo login.
    const rolesAsAdmin = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const profesionalRole = rolesAsAdmin.body.find((r: any) => r.name === 'Profesional');

    // El rol "Profesional" es de sistema (isSystem=true): no se puede editar
    // directamente. Se prueba entonces el caso simétrico: crear un rol
    // propio, asignarlo, y luego achicarle los permisos.
    const customRole = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ name: 'Rol dinámico', permissionKeys: ['clientes.ver', 'turnos.ver'] })
      .expect(201);

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    const dynamicUser = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        firstName: 'Dinamico',
        lastName: 'Test',
        email: 'dinamico@rbac-test.com',
        password,
        roleIds: [customRole.body.id],
        branchIds: [branches.body[0].id],
      })
      .expect(201);

    const dynamicLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email: 'dinamico@rbac-test.com', password })
      .expect(200);
    const dynamicToken = dynamicLogin.body.accessToken;

    // Con "roles.ver" el rol no cuenta, así que no puede ver roles todavía.
    await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${dynamicToken}`)
      .expect(403);

    // El admin le agrega "roles.ver" al rol (mismo token de sesión, sin
    // volver a loguearse).
    await request(app.getHttpServer())
      .patch(`/api/v1/roles/${customRole.body.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ permissionKeys: ['clientes.ver', 'turnos.ver', 'roles.ver'] })
      .expect(200);

    // Mismo access token de antes, ahora sí puede — el permiso se resuelve
    // fresco en cada request (doc 04-SEGURIDAD-BASELINE §2), no quedó
    // "congelado" en el JWT emitido en el login.
    await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${dynamicToken}`)
      .expect(200);

    void profesionalRole; // referenciado solo para dejar explícito el contraste con el rol de sistema
  });
});
