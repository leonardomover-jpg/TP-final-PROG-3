import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // rawBody: true (Etapa 16) — expone request.rawBody (Buffer) además del
  // body ya parseado, sin cambiar nada para el resto de los endpoints.
  // Lo necesita el webhook de WhatsApp: la firma X-Hub-Signature-256 de
  // Meta se calcula sobre los bytes crudos del body, no sobre el JSON ya
  // parseado (ver `whatsapp-client.ts`).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Cabeceras HTTP de seguridad (Etapa 23, doc `04-SEGURIDAD-BASELINE.md`
  // §4): HSTS, X-Content-Type-Options, X-Frame-Options, etc. — una API
  // JSON pura (sin HTML servido de acá) no necesita la Content-Security-
  // Policy pensada para browsers renderizando HTML propio, así que se
  // desactiva esa directiva puntual para no bloquear nada sin sentido acá
  // y dejar solo las cabeceras que sí aplican a una API.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta cualquier campo no declarado en el DTO (mitiga mass assignment)
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}
bootstrap();
