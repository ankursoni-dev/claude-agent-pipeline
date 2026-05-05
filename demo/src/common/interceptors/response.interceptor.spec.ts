import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

function makeContext(): ExecutionContext {
  // The interceptor never reads from context, so a stub is fine.
  return {} as unknown as ExecutionContext;
}

function makeNext<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  it('wraps a primitive return value into { data }', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeNext({ id: 'x' })),
    );

    expect(result).toEqual({ data: { id: 'x' } });
  });

  it('does not double-wrap an already-paginated response', async () => {
    const paginated = {
      data: [{ id: 'a' }, { id: 'b' }],
      meta: { page: 1, limit: 10, total: 2 },
    };

    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeNext(paginated)),
    );

    expect(result).toBe(paginated);
  });

  it('passes undefined through unchanged (void handlers stay void)', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeNext(undefined)),
    );

    expect(result).toBeUndefined();
  });

  it('passes null through unchanged', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeNext(null)),
    );

    expect(result).toBeNull();
  });
});
