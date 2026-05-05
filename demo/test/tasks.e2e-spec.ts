import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { bootstrapTestApp } from './utils/bootstrap-test-app';

describe('TasksController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    bootstrapTestApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /v1/tasks ───────────────────────────────────────────────────────

  describe('POST /v1/tasks', () => {
    it('returns 201 with wrapped data on valid input', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'Write unit tests' })
        .expect(201);

      expect(res.body).toMatchObject({
        data: {
          id: expect.any(String),
          title: 'Write unit tests',
          status: 'todo',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });
    });

    it('returns 201 with explicit status and description', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({
          title: 'Deploy to prod',
          description: 'Blue-green deployment',
          status: 'in_progress',
        })
        .expect(201);

      expect(res.body.data.status).toBe('in_progress');
      expect(res.body.data.description).toBe('Blue-green deployment');
    });

    it('returns 422 when title is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ description: 'no title' })
        .expect(422);

      expect(res.body).toMatchObject({
        statusCode: 422,
        error: 'VALIDATION_FAILED',
        message: expect.any(String),
        timestamp: expect.any(String),
        path: '/v1/tasks',
      });
    });

    it('returns 422 when title is too short and exposes an errors[] array', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'ab' })
        .expect(422);

      expect(res.body.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_FAILED');
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
      expect(res.body.errors[0]).toEqual({
        field: 'title',
        message: expect.stringContaining('title'),
      });
    });

    it('returns 422 when an unknown field is sent', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'Valid title', unknownField: 'should fail' })
        .expect(422);

      expect(res.body.statusCode).toBe(422);
    });

    it('returns 422 when status is an invalid enum value', async () => {
      await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'Valid title', status: 'INVALID_STATUS' })
        .expect(422);
    });
  });

  // ─── GET /v1/tasks ────────────────────────────────────────────────────────

  describe('GET /v1/tasks', () => {
    it('returns 200 with paginated envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tasks')
        .expect(200);

      expect(res.body).toMatchObject({
        data: expect.any(Array),
        meta: {
          page: expect.any(Number),
          limit: expect.any(Number),
          total: expect.any(Number),
        },
      });
    });

    it('respects page and limit query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tasks?page=1&limit=5')
        .expect(200);

      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(5);
    });

    it('returns 422 when limit exceeds 100', async () => {
      await request(app.getHttpServer())
        .get('/v1/tasks?limit=101')
        .expect(422);
    });

    it('returns 422 when page is 0', async () => {
      await request(app.getHttpServer())
        .get('/v1/tasks?page=0')
        .expect(422);
    });
  });

  // ─── GET /v1/tasks/:id ────────────────────────────────────────────────────

  describe('GET /v1/tasks/:id', () => {
    it('returns 200 with wrapped data for an existing task', async () => {
      // Create a task first
      const createRes = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'Findable task' })
        .expect(201);

      const id = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/v1/tasks/${id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        data: {
          id,
          title: 'Findable task',
        },
      });
    });

    it('returns 404 for a non-existent task', async () => {
      const ghostId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app.getHttpServer())
        .get(`/v1/tasks/${ghostId}`)
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        error: 'NOT_FOUND',
        timestamp: expect.any(String),
        path: `/v1/tasks/${ghostId}`,
      });
    });

    it('returns 400 when :id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tasks/not-a-uuid')
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
      });
    });
  });

  // ─── PATCH /v1/tasks/:id ─────────────────────────────────────────────────

  describe('PATCH /v1/tasks/:id', () => {
    it('returns 200 with updated task data', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'Original title' })
        .expect(201);

      const id = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .patch(`/v1/tasks/${id}`)
        .send({ title: 'Updated title', status: 'done' })
        .expect(200);

      expect(res.body).toMatchObject({
        data: {
          id,
          title: 'Updated title',
          status: 'done',
        },
      });
    });

    it('returns 404 for a non-existent task', async () => {
      const ghostId = '11111111-1111-4111-8111-111111111111';
      const res = await request(app.getHttpServer())
        .patch(`/v1/tasks/${ghostId}`)
        .send({ title: 'Ghost update' })
        .expect(404);

      expect(res.body.statusCode).toBe(404);
    });

    it('returns 400 when :id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .patch('/v1/tasks/ghost-id')
        .send({ title: 'Whatever' })
        .expect(400);
    });

    it('returns 422 when body is empty', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'Empty patch subject' })
        .expect(201);

      const id = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .patch(`/v1/tasks/${id}`)
        .send({})
        .expect(422);

      expect(res.body).toMatchObject({
        statusCode: 422,
        error: 'VALIDATION_FAILED',
        message: expect.stringContaining('at least one'),
      });
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0]).toMatchObject({
        field: 'body',
        message: expect.stringContaining('at least one'),
      });
    });

    it('returns 422 when body contains an unknown field', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'Patch subject' })
        .expect(201);

      const id = createRes.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/v1/tasks/${id}`)
        .send({ description: 'should not be patchable' })
        .expect(422);
    });
  });

  // ─── DELETE /v1/tasks/:id ─────────────────────────────────────────────────

  describe('DELETE /v1/tasks/:id', () => {
    it('returns 204 and no body when deleting a todo task', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'To be deleted' })
        .expect(201);

      const id = createRes.body.data.id as string;

      await request(app.getHttpServer())
        .delete(`/v1/tasks/${id}`)
        .expect(204);

      // Confirm it is gone
      await request(app.getHttpServer())
        .get(`/v1/tasks/${id}`)
        .expect(404);
    });

    it('returns 404 for a non-existent task', async () => {
      const ghostId = '22222222-2222-4222-8222-222222222222';
      const res = await request(app.getHttpServer())
        .delete(`/v1/tasks/${ghostId}`)
        .expect(404);

      expect(res.body.statusCode).toBe(404);
    });

    it('returns 400 when :id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .delete('/v1/tasks/does-not-exist')
        .expect(400);
    });

    it('returns 409 with TASK_IN_PROGRESS code when deleting an in_progress task', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/tasks')
        .send({ title: 'Busy task', status: 'in_progress' })
        .expect(201);

      const id = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .delete(`/v1/tasks/${id}`)
        .expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'TASK_IN_PROGRESS',
        timestamp: expect.any(String),
        path: `/v1/tasks/${id}`,
      });
    });
  });
});
