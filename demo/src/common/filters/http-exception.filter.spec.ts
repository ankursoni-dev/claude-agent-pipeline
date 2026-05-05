import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

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

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('formats a 404 NotFoundException into the standard envelope', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'GET', path: '/v1/tasks/abc' });

    filter.catch(new NotFoundException('Task with id "abc" not found'), host);

    expect(captured.statusCode).toBe(404);
    expect(captured.body).toMatchObject({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: 'Task with id "abc" not found',
      path: '/v1/tasks/abc',
    });
    expect(captured.body!.timestamp).toEqual(expect.any(String));
  });

  it('strips query string from path by using request.path', () => {
    const captured: CapturedResponse = {};
    // request.path excludes the query string; the filter must use it,
    // not request.url, so secrets / ids in query strings do not show up
    // in error responses.
    const host = makeHost(captured, {
      method: 'GET',
      path: '/v1/tasks',
    });

    filter.catch(new BadRequestException('bad'), host);

    expect(captured.body!.path).toBe('/v1/tasks');
  });

  it('honors a custom UPPER_SNAKE_CASE error code from a ConflictException payload', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, {
      method: 'DELETE',
      path: '/v1/tasks/1',
    });

    filter.catch(
      new ConflictException({
        error: 'TASK_IN_PROGRESS',
        message: 'cannot delete',
      }),
      host,
    );

    expect(captured.body).toMatchObject({
      statusCode: 409,
      error: 'TASK_IN_PROGRESS',
      message: 'cannot delete',
    });
  });

  it('falls through to the status-code map when error field is a human phrase', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'GET', path: '/x' });

    // Built-in NestJS sets `error: 'Not Found'` (a phrase).
    filter.catch(new NotFoundException('missing'), host);

    expect(captured.body!.error).toBe('NOT_FOUND');
  });

  it('produces an errors[] array on 422 with field/message extracted', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'POST', path: '/v1/tasks' });

    // Mimic the shape ValidationPipe sends: an HttpException at 422 whose
    // response body has a `message` array of strings.
    const ex = new HttpException(
      {
        statusCode: 422,
        message: [
          'title must be longer than or equal to 3 characters',
          'status must be one of the following values',
        ],
        error: 'Unprocessable Entity',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    filter.catch(ex, host);

    expect(captured.body!.statusCode).toBe(422);
    expect(captured.body!.error).toBe('VALIDATION_FAILED');
    expect(captured.body!.errors).toEqual([
      {
        field: 'title',
        message: 'title must be longer than or equal to 3 characters',
      },
      {
        field: 'status',
        message: 'status must be one of the following values',
      },
    ]);
  });

  it('logs at error level for 5xx HttpExceptions', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'GET', path: '/x' });

    filter.catch(
      new HttpException('upstream', HttpStatus.SERVICE_UNAVAILABLE),
      host,
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('honors a caller-supplied errors[] array on 422', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'PATCH', path: '/v1/tasks/x' });

    const ex = new HttpException(
      {
        statusCode: 422,
        error: 'VALIDATION_FAILED',
        message: 'at least one of title, status is required',
        errors: [
          { field: 'body', message: 'at least one of title, status is required' },
        ],
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    filter.catch(ex, host);

    expect(captured.body!.errors).toEqual([
      { field: 'body', message: 'at least one of title, status is required' },
    ]);
  });

  it('does NOT log at error level for 4xx HttpExceptions', () => {
    const captured: CapturedResponse = {};
    const host = makeHost(captured, { method: 'GET', path: '/x' });

    filter.catch(new NotFoundException('nope'), host);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
