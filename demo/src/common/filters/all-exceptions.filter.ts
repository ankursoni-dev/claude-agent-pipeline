import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
}

/**
 * Catch-all filter for any exception that is not an HttpException.
 *
 * Two responsibilities:
 *   1. Log the original exception at error level (with stack) so operators
 *      can see what blew up.
 *   2. Return a generic 500 envelope to the client. We deliberately do NOT
 *      echo the thrown error's message — internal exception messages can
 *      leak DB column names, file paths, secrets, or stack traces and must
 *      not cross the trust boundary.
 *
 * Filter ordering note: register this LAST in `useGlobalFilters(...)` so it
 * acts as the broadest fallback. NestJS applies filters right-to-left when
 * matching, so the more specific HttpExceptionFilter (registered after this
 * one) runs first.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Defensive: an HttpException that bubbles past HttpExceptionFilter
    // shouldn't happen in practice, but if it does we still want this filter
    // to honor it rather than coerce it to 500.
    if (exception instanceof HttpException) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();
      const statusCode = exception.getStatus();

      this.logger.error(
        `[unhandled-by-http-filter] ${request.method} ${request.path} -> ${statusCode}`,
        exception.stack,
      );

      const fallbackBody: ErrorBody = {
        statusCode,
        error: 'HTTP_ERROR',
        message: 'An error occurred',
        timestamp: new Date().toISOString(),
        path: request.path,
      };
      response.status(statusCode).json(fallbackBody);
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const stack =
      exception instanceof Error ? exception.stack : String(exception);
    const summary =
      exception instanceof Error
        ? `${exception.name}: ${exception.message}`
        : 'non-error exception';

    this.logger.error(
      `[unhandled] ${request.method} ${request.path} -> 500: ${summary}`,
      stack,
    );

    const body: ErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.path,
    };

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
