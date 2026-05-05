import { INestApplication } from '@nestjs/common';
import { configureApp } from '../../src/common/bootstrap/configure-app';

/**
 * Apply the project's shared global wiring to an in-memory test app.
 * Delegates to the same `configureApp` used by `main.ts` so prod and test
 * paths cannot drift.
 */
export function bootstrapTestApp(app: INestApplication): void {
  configureApp(app);
}
