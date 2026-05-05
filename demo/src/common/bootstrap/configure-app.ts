import {
  HttpStatus,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { ResponseInterceptor } from '../interceptors/response.interceptor';

/**
 * Apply the project's standard global wiring (pipes, filters, interceptors,
 * versioning) to a NestJS app instance.
 *
 * Shared by `main.ts` (production bootstrap) and the e2e test setup so the
 * two paths cannot drift apart: any change here applies to both.
 *
 * Helmet and CORS are intentionally NOT applied here — they require boot-time
 * env validation (`assertCorsOriginConfigured`) and are wired in `main.ts`
 * directly. Tests don't go through CORS or helmet.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );

  // Filter ordering: Nest applies global filters right-to-left when matching,
  // so the more specific HttpExceptionFilter must be registered LAST so that
  // it runs first; AllExceptionsFilter is the broadest fallback.
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.enableVersioning({ type: VersioningType.URI });
}
