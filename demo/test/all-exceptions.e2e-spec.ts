import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  Logger,
  Module,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bootstrapTestApp } from './utils/bootstrap-test-app';

@Controller({ path: 'boom', version: '1' })
class BoomController {
  @Get()
  doBoom(): void {
    throw new Error('SECRET_DB_PASSWORD=hunter2 leaked-detail-here');
  }
}

@Module({ controllers: [BoomController] })
class BoomTestModule {}

describe('AllExceptionsFilter (e2e)', () => {
  let app: INestApplication<App>;
  let errorSpy: jest.SpyInstance;

  beforeAll(async () => {
    // Suppress error logs from the filter so test output stays clean.
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BoomTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    bootstrapTestApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    errorSpy.mockRestore();
  });

  it('returns standard 500 envelope on uncaught Error and does not leak the message', async () => {
    const res = await request(app.getHttpServer()).get('/v1/boom').expect(500);

    expect(res.body).toMatchObject({
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      timestamp: expect.any(String),
      path: '/v1/boom',
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(JSON.stringify(res.body)).not.toContain('leaked-detail-here');
  });

  it('logs the underlying exception at error level', async () => {
    errorSpy.mockClear();

    await request(app.getHttpServer()).get('/v1/boom').expect(500);

    expect(errorSpy).toHaveBeenCalled();
  });
});
