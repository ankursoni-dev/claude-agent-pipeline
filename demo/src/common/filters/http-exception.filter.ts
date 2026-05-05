import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ValidationError {
  field: string;
  message: string;
}

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
  errors?: ValidationError[];
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const body: ErrorBody = {
      statusCode,
      error: this.toMachineCode(statusCode, exceptionResponse),
      message: this.extractMessage(exceptionResponse),
      timestamp: new Date().toISOString(),
      path: request.path,
    };

    if (statusCode === HttpStatus.UNPROCESSABLE_ENTITY) {
      const validationErrors = this.extractValidationErrors(exceptionResponse);
      if (validationErrors.length > 0) {
        body.errors = validationErrors;
      }
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // 5xx HttpExceptions are rare but possible (e.g. ServiceUnavailable,
      // BadGateway thrown intentionally by code). Treat them as actionable.
      this.logger.error(
        `${request.method} ${request.path} -> ${statusCode}: ${body.message}`,
        exception.stack,
      );
    }

    response.status(statusCode).json(body);
  }

  private toMachineCode(
    statusCode: number,
    exceptionResponse: string | object,
  ): string {
    // Allow callers to pass a custom UPPER_SNAKE_CASE machine code via { error: 'CODE' }.
    // NestJS built-in exceptions also set { error: 'Not Found' } (human phrase) — we must
    // ignore those and fall through to our status-code map.
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'error' in exceptionResponse
    ) {
      const raw = (exceptionResponse as Record<string, unknown>)['error'];
      if (typeof raw === 'string' && /^[A-Z][A-Z0-9_]+$/.test(raw)) {
        // Already in UPPER_SNAKE_CASE — treat as machine code
        return raw;
      }
    }

    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_FAILED',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return map[statusCode] ?? 'HTTP_ERROR';
  }

  private extractMessage(exceptionResponse: string | object): string {
    if (typeof exceptionResponse === 'string') return exceptionResponse;
    const res = exceptionResponse as Record<string, unknown>;
    if (Array.isArray(res['message'])) {
      return 'Validation failed';
    }
    if (typeof res['message'] === 'string') return res['message'];
    return 'An error occurred';
  }

  private extractValidationErrors(
    exceptionResponse: string | object,
  ): ValidationError[] {
    if (typeof exceptionResponse !== 'object' || exceptionResponse === null) {
      return [];
    }
    const res = exceptionResponse as Record<string, unknown>;

    // Honor a caller-supplied, pre-built `errors` array if its entries match
    // the {field, message} shape. Lets services throw structured 422s without
    // round-tripping through the class-validator string format.
    if (Array.isArray(res['errors'])) {
      const valid = (res['errors'] as unknown[]).filter(
        (e): e is ValidationError =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as Record<string, unknown>)['field'] === 'string' &&
          typeof (e as Record<string, unknown>)['message'] === 'string',
      );
      if (valid.length > 0) return valid;
    }

    if (!Array.isArray(res['message'])) return [];

    // class-validator messages are strings like "title must be longer than..."
    return (res['message'] as string[]).map((msg) => {
      // Extract field name from the beginning of the message when possible
      const parts = msg.split(' ');
      return { field: parts[0] ?? 'unknown', message: msg };
    });
  }
}
