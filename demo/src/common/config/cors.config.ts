/**
 * CORS configuration helpers.
 *
 * Express CORS with `credentials: true` and an undefined `origin` reflects every
 * requesting origin in `Access-Control-Allow-Origin` — a textbook credentialed-CORS
 * escalation. We refuse to boot in non-test environments without an explicit
 * CORS_ORIGIN to make this misconfiguration impossible to ship.
 */

export interface CorsBootEnv {
  CORS_ORIGIN?: string;
  NODE_ENV?: string;
}

/**
 * Throws if CORS_ORIGIN is missing in a non-test environment.
 * Tests can run with no CORS_ORIGIN — there is no browser, no credentials at risk.
 */
export function assertCorsOriginConfigured(env: CorsBootEnv): void {
  if (!env.CORS_ORIGIN && env.NODE_ENV !== 'test') {
    throw new Error(
      'CORS_ORIGIN must be set in non-test environments. ' +
        'Set CORS_ORIGIN to an explicit origin (e.g. https://app.example.com) or ' +
        '"false" to disable CORS entirely.',
    );
  }
}

/**
 * Resolve the value to pass to NestJS `enableCors({ origin })`.
 * Returns the configured origin if set, otherwise `false` (CORS disabled).
 * Treats an empty string the same as undefined.
 */
export function resolveCorsOrigin(env: CorsBootEnv): string | false {
  return env.CORS_ORIGIN ? env.CORS_ORIGIN : false;
}
