import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('Auth (Etapa 2)', () => {
  let app: INestApplication;
  const slug = uniqueSlug('barberia-auth');
  const password = 'SuperSecreta123!';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registra un negocio nuevo y devuelve tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Barbería Test Auth',
        slug,
        firstName: 'Ana',
        lastName: 'Gómez',
        email: 'admin@auth-test.com',
        password,
      })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.tenant.slug).toBe(slug);
  });

  it('rechaza un slug de negocio duplicado', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Otro negocio',
        slug, // mismo slug que el test anterior
        firstName: 'Otro',
        lastName: 'Admin',
        email: 'otro@auth-test.com',
        password,
      })
      .expect(409);
  });

  it('rechaza login con contraseña incorrecta', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email: 'admin@auth-test.com', password: 'incorrecta' })
      .expect(401);
  });

  it('permite login con credenciales correctas', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email: 'admin@auth-test.com', password })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rechaza acceder a un endpoint protegido sin token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
  });

  it('permite acceder a un endpoint protegido con token válido', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email: 'admin@auth-test.com', password })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
  });

  it('rota el refresh token y revoca el anterior (no se puede reusar)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email: 'admin@auth-test.com', password })
      .expect(200);

    const firstRefresh = login.body.refreshToken;

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    expect(refreshed.body.accessToken).toBeDefined();

    // Reusar el mismo refresh token ya rotado debe fallar.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(401);
  });

  it('logout revoca el refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantSlug: slug, email: 'admin@auth-test.com', password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
