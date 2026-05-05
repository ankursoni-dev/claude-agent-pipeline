import {
  ArgumentsHost,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface CapturedResponse {
  statusCode?: number;
  body?: Record<string, unknown>;
}

function makeHost(
  capture: CapturedResponse,
  request: { method: string; path: string },
): ArgumentsHost {
  const response = {
    status: (code: number) => {
      capture.statusCode = code;
      return {
        json: (b: Record<string, unknown>) => {
          capture.body = b;
        },
      };
    },
  };
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns the generic 500 envelope for an arbitrary Error and does NOT echo the message', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, {
      method: 'GET',
      path: '/v1/tasks',
    });

    filter.catch(new Error('SECRET_DB_PASSWORD=hunter2'), host);

    expect(captured.statusCode).toBe(500);
    expect(captured.body).toMatchObject({
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      path: '/v1/tasks',
    });
    // The thrown message must NOT appear anywhere in the response body.
    expect(JSON.stringify(captured.body)).not.toContain('hunter2');
    expect(JSON.stringify(captured.body)).not.toContain('SECRET_DB_PASSWORD');
  });

  it('logs the original exception summary and stack at error level', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'GET', path: '/x' });

    filter.catch(new Error('boom'), host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [msg] = errorSpy.mock.calls[0];
    expect(String(msg)).toContain('GET /x -> 500');
    expect(String(msg)).toContain('boom');
  });

  it('handles non-Error throwables gracefully', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'GET', path: '/x' });

    filter.catch('plain string thrown', host);

    expect(captured.statusCode).toBe(500);
    expect(captured.body!.error).toBe('INTERNAL_SERVER_ERROR');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('honors HttpException status if one bubbles through', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'GET', path: '/x' });

    filter.catch(new BadGatewayException('upstream'), host);

    expect(captured.statusCode).toBe(502);
    // Generic message — never echo through this fallback path.
    expect(captured.body!.message).toBe('An error occurred');
    expect(errorSpy).toHaveBeenCalled();
  });
});
