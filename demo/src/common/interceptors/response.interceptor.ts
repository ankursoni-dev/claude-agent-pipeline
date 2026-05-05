import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { PaginatedResponse } from '../types/pagination.types';

export interface SingleResponse<T> {
  data: T;
}

type ServiceResponse<T> = PaginatedResponse<T> | T | null | undefined;

function isPaginatedResponse<T>(
  value: unknown,
): value is PaginatedResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Array.isArray((value as PaginatedResponse<T>).data) &&
    'meta' in value &&
    typeof (value as PaginatedResponse<T>).meta === 'object'
  );
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<ServiceResponse<T>, SingleResponse<T> | PaginatedResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<ServiceResponse<T>>,
  ): Observable<SingleResponse<T> | PaginatedResponse<T>> {
    return next.handle().pipe(
      map((value) => {
        // Void / null handler returns (e.g. 204 No Content): pass through
        // unchanged so we don't emit a misleading `{ data: undefined }` body.
        // Nest's HTTP layer will suppress the body for 204; for non-204
        // void/null returns the explicit pass-through still avoids the
        // accidental envelope wrap.
        if (value === undefined || value === null) {
          return value as unknown as SingleResponse<T>;
        }
        // Already wrapped (e.g. paginated list from service)
        if (isPaginatedResponse<T>(value)) {
          return value;
        }
        return { data: value as T };
      }),
    );
  }
}
