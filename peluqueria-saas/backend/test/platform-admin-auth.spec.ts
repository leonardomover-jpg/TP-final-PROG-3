import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authenticator } from 'otplib';
import * as argon2 from 'argon2';
import { createTestApp } from './setup';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@platform-admin-test.com`;
}

async function createPlatformAdmin(email: string, password: string) {
  const passwordHash = await argon2.hash(password);
  return prisma.platformAdmin.create({ data: { email, passwordHash } });
}

describe('PlatformAdmin Auth — MFA obligatorio (Etapa 3)', () => {
  let app: INestApplication;
  const password = 'SuperSecretaAdmin123!';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('el primer login (sin MFA todavía) no devuelve tokens de acceso, solo el desafío de enrolamiento', async () => {
    const email = uniqueEmail('admin1');
    await createPlatformAdmin(email, password);

    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.mfaSetupRequired).toBe(true);
    expect(res.body.otpauthUrl).toBeDefined();
    expect(res.body.secret).toBeDefined();
    expect(res.body.accessToken).toBeUndefined();
  });

  it('completa el enrolamiento de MFA con un código válido y recién ahí entrega tokens', async () => {
    const email = uniqueEmail('admin2');
    await createPlatformAdmin(email, password);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/login')
      .send({ email, password })
      .expect(200);

    const code = authenticator.generate(loginRes.body.secret);
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/mfa/verify')
      .send({ mfaChallengeToken: loginRes.body.mfaChallengeToken, code })
      .expect(200);

    expect(verifyRes.body.accessToken).toBeDefined();
    expect(verifyRes.body.refreshToken).toBeDefined();

    const admin = await prisma.platformAdmin.findUnique({ where: { email } });
    expect(admin?.mfaEnabled).toBe(true);
  });

  it('un login posterior (ya con MFA activo) exige el código en cada intento', async () => {
    const email = uniqueEmail('admin3');
    await createPlatformAdmin(email, password);

    // Enrolamiento
    const firstLogin = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/login')
      .send({ email, password })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/mfa/verify')
      .send({
        mfaChallengeToken: firstLogin.body.mfaChallengeToken,
        code: authenticator.generate(firstLogin.body.secret),
      })
      .expect(200);

    // Segundo login: ahora mfaEnabled=true -> solo desafío, sin secret nuevo.
    const secondLogin = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/login')
      .send({ email, password })
      .expect(200);
    expect(secondLogin.body.mfaRequired).toBe(true);
    expect(secondLogin.body.secret).toBeUndefined();
    expect(secondLogin.body.accessToken).toBeUndefined();

    const admin = await prisma.platformAdmin.findUnique({ where: { email } });
    const code = authenticator.generate(admin!.mfaSecret!);
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/mfa/verify')
      .send({ mfaChallengeToken: secondLogin.body.mfaChallengeToken, code })
      .expect(200);
    expect(verifyRes.body.accessToken).toBeDefined();
  });

  it('rechaza un código de MFA incorrecto', async () => {
    const email = uniqueEmail('admin4');
    await createPlatformAdmin(email, password);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/login')
      .send({ email, password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/mfa/verify')
      .send({ mfaChallengeToken: loginRes.body.mfaChallengeToken, code: '000000' })
      .expect(401);
  });

  it('bloquea la cuenta temporalmente tras varios intentos fallidos de password', async () => {
    const email = uniqueEmail('admin5');
    await createPlatformAdmin(email, password);

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/platform-admin/auth/login')
        .send({ email, password: 'incorrecta' });
    }

    // El 5to intento fallido dispara el lockout; el siguiente intento
    // (aunque la password ahora sea correcta) debe quedar bloqueado.
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/login')
      .send({ email, password });
    expect(res.status).toBe(403);

    const admin = await prisma.platformAdmin.findUnique({ where: { email } });
    expect(admin?.lockedUntil).not.toBeNull();
  });

  it('un endpoint de negocio no acepta un token de SUPER ADMIN, y viceversa', async () => {
    const email = uniqueEmail('admin6');
    await createPlatformAdmin(email, password);
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/login')
      .send({ email, password })
      .expect(200);
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/auth/mfa/verify')
      .send({
        mfaChallengeToken: loginRes.body.mfaChallengeToken,
        code: authenticator.generate(loginRes.body.secret),
      })
      .expect(200);
    const platformAdminToken = verifyRes.body.accessToken;

    // Token de SUPER ADMIN contra un endpoint de negocio -> rechazado.
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(401);

    // Un token de negocio (registro normal) contra un endpoint de SUPER ADMIN -> rechazado.
    const tenantSlug = `tenant-vs-admin-${Date.now()}`;
    const tenantReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        businessName: 'Negocio Cualquiera',
        slug: tenantSlug,
        firstName: 'Ana',
        lastName: 'Gomez',
        email: `admin@${tenantSlug}.com`,
        password,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/platform-admin/tenants')
      .set('Authorization', `Bearer ${tenantReg.body.accessToken}`)
      .expect(401);
  });
});
