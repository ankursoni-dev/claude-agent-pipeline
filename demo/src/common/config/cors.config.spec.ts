import {
  assertCorsOriginConfigured,
  resolveCorsOrigin,
} from './cors.config';

describe('cors.config', () => {
  describe('assertCorsOriginConfigured', () => {
    it('throws when CORS_ORIGIN is unset and NODE_ENV is not test', () => {
      expect(() =>
        assertCorsOriginConfigured({ NODE_ENV: 'production' }),
      ).toThrow(/CORS_ORIGIN must be set/);
    });

    it('throws when CORS_ORIGIN is empty string and NODE_ENV is not test', () => {
      expect(() =>
        assertCorsOriginConfigured({
          CORS_ORIGIN: '',
          NODE_ENV: 'development',
        }),
      ).toThrow(/CORS_ORIGIN must be set/);
    });

    it('does not throw when CORS_ORIGIN is set in production', () => {
      expect(() =>
        assertCorsOriginConfigured({
          CORS_ORIGIN: 'https://app.example.com',
          NODE_ENV: 'production',
        }),
      ).not.toThrow();
    });

    it('does not throw when NODE_ENV is test even if CORS_ORIGIN is unset', () => {
      expect(() =>
        assertCorsOriginConfigured({ NODE_ENV: 'test' }),
      ).not.toThrow();
    });

    it('does not throw when NODE_ENV is undefined but CORS_ORIGIN is set', () => {
      expect(() =>
        assertCorsOriginConfigured({ CORS_ORIGIN: 'https://x.test' }),
      ).not.toThrow();
    });

    it('throws when both NODE_ENV and CORS_ORIGIN are undefined', () => {
      expect(() => assertCorsOriginConfigured({})).toThrow(
        /CORS_ORIGIN must be set/,
      );
    });
  });

  describe('resolveCorsOrigin', () => {
    it('returns the configured origin when set', () => {
      expect(
        resolveCorsOrigin({ CORS_ORIGIN: 'https://app.example.com' }),
      ).toBe('https://app.example.com');
    });

    it('returns false when CORS_ORIGIN is unset', () => {
      expect(resolveCorsOrigin({})).toBe(false);
    });

    it('returns false when CORS_ORIGIN is an empty string', () => {
      expect(resolveCorsOrigin({ CORS_ORIGIN: '' })).toBe(false);
    });
  });
});
