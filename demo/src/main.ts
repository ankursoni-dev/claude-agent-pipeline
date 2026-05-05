import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  assertCorsOriginConfigured,
  resolveCorsOrigin,
} from './common/config/cors.config';
import { configureApp } from './common/bootstrap/configure-app';

async function bootstrap() {
  // Fail-fast guardrail before doing anything else.
  assertCorsOriginConfigured(process.env);

  const app = await NestFactory.create(AppModule);

  // Standard wiring (pipes, filters, interceptors, versioning) shared with
  // the e2e test harness via configureApp.
  configureApp(app);

  // Production-only middleware (not applied in tests):
  app.use(helmet());
  app.enableCors({
    origin: resolveCorsOrigin(process.env),
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
