import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';

describe('Observabilidad — GET /health (Etapa 22)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 sin autenticación, con conectividad real a la base', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok', uptimeSeconds: expect.any(Number) });
  });
});
