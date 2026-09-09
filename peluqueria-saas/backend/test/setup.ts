import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // rawBody: true (Etapa 16) — mismo motivo que en main.ts: el webhook de
  // WhatsApp necesita el body crudo para verificar X-Hub-Signature-256.
  const app = moduleRef.createNestApplication({ rawBody: true });
  // helmet (Etapa 23) — mismo bootstrap que main.ts, para que los tests
  // ejerciten exactamente lo mismo que corre en producción.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}
