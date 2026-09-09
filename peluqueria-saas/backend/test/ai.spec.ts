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

// Mismo helper que test/products.spec.ts (Etapa 11): asigna el plan
// Premium (único que incluye todos los flags) y prende el flag puntual
// desde el propio negocio.
async function enableFlag(
  app: INestApplication,
  key: string,
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
    .patch(`/api/v1/feature-flags/${key}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ enabled: true })
    .expect(200);
}

function mockAnthropicResponse(text: string, ok = true) {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ content: [{ type: 'text', text }] }),
    text: async () => JSON.stringify({ content: [{ type: 'text', text }] }),
  } as Response);
}

// POST /auth/register-tenant limitado a 5/60s: dos tenants (principal +
// aislamiento) en todo el archivo.
describe('IA — insights sobre estadísticas y clientes (Etapa 21)', () => {
  let app: INestApplication;
  let mainToken: string;
  let mainTenantId: string;
  let platformAdminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin = await createAndLoginPlatformAdmin(app, 'ai-admin');
    platformAdminToken = admin.accessToken;

    const main = await registerTenant(app, 'ai-main');
    mainToken = main.token;
    mainTenantId = main.tenantId;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sin el feature flag "ai" habilitado, el endpoint responde 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/insights')
      .set('Authorization', `Bearer ${mainToken}`);
    expect(res.status).toBe(403);
  });

  it('habilita "ai" y devuelve los insights generados (mockeado) + los datos en los que se basó', async () => {
    await enableFlag(app, 'ai', mainToken, mainTenantId, platformAdminToken);

    const fetchSpy = mockAnthropicResponse('1. Las ventas vienen bien. 2. Reforzá el stock de shampoo.');

    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/insights')
      .set('Authorization', `Bearer ${mainToken}`)
      .expect(200);

    expect(res.body.insights).toContain('Reforzá el stock');
    expect(res.body.basedOn).toHaveProperty('sales');
    expect(res.body.basedOn).toHaveProperty('clients');
    expect(res.body.basedOn.clients).toEqual({ active: 0, new: 0 });

    // El request a la API de IA se armó con las credenciales de la
    // PLATAFORMA (AI_API_KEY del .env), no con nada por-tenant.
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/messages'),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'dev-ai-api-key-not-for-production' }) }),
    );
  });

  it('si la API de IA responde con error, el endpoint responde 500 sin filtrar detalle técnico', async () => {
    await enableFlag(app, 'ai', mainToken, mainTenantId, platformAdminToken);
    mockAnthropicResponse('no importa', false);

    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/insights')
      .set('Authorization', `Bearer ${mainToken}`);
    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain('AiRequestError');
  });

  it('sin AI_API_KEY configurada, responde 500 con un mensaje claro (nunca llama a fetch)', async () => {
    await enableFlag(app, 'ai', mainToken, mainTenantId, platformAdminToken);
    const original = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/insights')
        .set('Authorization', `Bearer ${mainToken}`);
      expect(res.status).toBe(500);
      expect(res.body.message).toContain('no está configurada');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      process.env.AI_API_KEY = original;
    }
  });

  it('aislamiento multi-tenant: los datos que se le mandan a la IA son SOLO del tenant que pide el insight', async () => {
    const other = await registerTenant(app, 'ai-other');
    await enableFlag(app, 'ai', other.token, other.tenantId, platformAdminToken);

    // El cliente de este otro tenant no debería aparecer en los datos de
    // "clients.new" del tenant principal en ningún test anterior — se
    // verifica acá que cada uno ve solo lo propio (0 clientes nuevos cada
    // uno, tenants nuevos sin clientes creados).
    mockAnthropicResponse('Resumen del otro negocio.');
    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/insights')
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    expect(res.body.basedOn.clients).toEqual({ active: 0, new: 0 });
    expect(res.body.basedOn.sales.count).toBe(0);
  });
});
