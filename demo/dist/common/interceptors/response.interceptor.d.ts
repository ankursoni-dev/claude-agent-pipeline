import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { PaginatedResponse } from '../types/pagination.types';
export interface SingleResponse<T> {
    data: T;
}
type ServiceResponse<T> = PaginatedResponse<T> | T | null | undefined;
export declare class ResponseInterceptor<T> implements NestInterceptor<ServiceResponse<T>, SingleResponse<T> | PaginatedResponse<T>> {
    intercept(_context: ExecutionContext, next: CallHandler<ServiceResponse<T>>): Observable<SingleResponse<T> | PaginatedResponse<T>>;
}
export {};
