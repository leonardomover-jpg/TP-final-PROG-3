import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authenticator } from 'otplib';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Crea un PlatformAdmin y lo hace pasar por el login + enrolamiento de MFA
// completo, devolviendo un accessToken listo para usar — evita repetir el
// flujo de dos pasos en cada test que solo necesita "un SUPER ADMIN logueado".
export async function createAndLoginPlatformAdmin(
  app: INestApplication,
  emailPrefix: string,
  password = 'SuperSecretaAdmin123!',
): Promise<{ accessToken: string; email: string }> {
  const email = `${emailPrefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@platform-admin-test.com`;
  const passwordHash = await argon2.hash(password);
  await prisma.platformAdmin.create({ data: { email, passwordHash } });

  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/platform-admin/auth/login')
    .send({ email, password })
    .expect(200);

  const code = authenticator.generate(loginRes.body.secret);
  const verifyRes = await request(app.getHttpServer())
    .post('/api/v1/platform-admin/auth/mfa/verify')
    .send({ mfaChallengeToken: loginRes.body.mfaChallengeToken, code })
    .expect(200);

  return { accessToken: verifyRes.body.accessToken, email };
}

export { prisma as testPrisma };
