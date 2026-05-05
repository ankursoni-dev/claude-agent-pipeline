import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TASK_REPOSITORY } from './tasks.tokens';
import { Task, TaskRepository } from './task.interface';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Default Task',
    status: 'todo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TasksService', () => {
  let service: TasksService;
  let repo: jest.Mocked<TaskRepository>;

  beforeEach(async () => {
    const mockRepo: jest.Mocked<TaskRepository> = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TASK_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    repo = module.get(TASK_REPOSITORY);
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a task with defaults and returns a TaskResponseDto', () => {
      const saved = makeTask({ title: 'Buy milk', status: 'todo' });
      repo.create.mockReturnValue(saved);

      const result = service.create({ title: 'Buy milk' });

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result.title).toBe('Buy milk');
      expect(result.status).toBe('todo');
      expect(typeof result.id).toBe('string');
      expect(typeof result.createdAt).toBe('string');
    });

    it('respects an explicit status from the DTO', () => {
      const saved = makeTask({ title: 'Task A', status: 'in_progress' });
      repo.create.mockReturnValue(saved);

      const result = service.create({ title: 'Task A', status: 'in_progress' });

      expect(result.status).toBe('in_progress');
    });

    it('stores description when provided', () => {
      const saved = makeTask({ title: 'Desc task', description: 'some detail' });
      repo.create.mockReturnValue(saved);

      const result = service.create({
        title: 'Desc task',
        description: 'some detail',
      });

      expect(result.description).toBe('some detail');
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('passes the page request through to the repository unchanged', () => {
      repo.findPage.mockReturnValue({ rows: [], total: 0 });

      service.findAll(3, 7);

      expect(repo.findPage).toHaveBeenCalledWith({ page: 3, limit: 7 });
    });

    it('returns paginated results from the repo', () => {
      const tasks = [1, 2].map((n) =>
        makeTask({ id: `id-${n}`, title: `Task ${n}` }),
      );
      repo.findPage.mockReturnValue({ rows: tasks, total: 5 });

      const result = service.findAll(1, 2);

      expect(result.meta.total).toBe(5);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('id-1');
      expect(result.data[1].id).toBe('id-2');
    });

    it('returns empty data array when repository page is empty', () => {
      repo.findPage.mockReturnValue({ rows: [], total: 0 });

      const result = service.findAll(1, 20);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('returns empty data when page is beyond the available range but echoes the meta', () => {
      // Repo would return rows: [] and total reflecting all items.
      repo.findPage.mockReturnValue({ rows: [], total: 5 });

      const result = service.findAll(99, 10);

      expect(result.data).toHaveLength(0);
      expect(result.meta).toEqual({ page: 99, limit: 10, total: 5 });
    });

    it('strips non-whitelisted fields from repository rows in the response', () => {
      // Negative-projection: even if the repo leaks an internal-only field,
      // TaskResponseDto's `excludeExtraneousValues` must drop it.
      const leaky = {
        ...makeTask({ id: 'x' }),
        internal_only: 'secret',
      } as Task & { internal_only: string };
      repo.findPage.mockReturnValue({ rows: [leaky], total: 1 });

      const result = service.findAll(1, 10);

      expect(result.data[0]).not.toHaveProperty('internal_only');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a TaskResponseDto when the task exists', () => {
      repo.findById.mockReturnValue(makeTask({ id: 'abc' }));

      const result = service.findOne('abc');

      expect(result.id).toBe('abc');
      expect(repo.findById).toHaveBeenCalledWith('abc');
    });

    it('throws NotFoundException when the task does not exist', () => {
      repo.findById.mockReturnValue(undefined);

      expect(() => service.findOne('missing')).toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates title only', () => {
      const existing = makeTask({ id: 'x', title: 'Old title' });
      const updated = { ...existing, title: 'New title', updatedAt: 'ts' };
      repo.findById.mockReturnValue(existing);
      repo.update.mockReturnValue(updated);

      const result = service.update('x', { title: 'New title' });

      expect(result.title).toBe('New title');
      expect(repo.update).toHaveBeenCalledWith(
        'x',
        expect.objectContaining({ title: 'New title' }),
      );
    });

    it('updates status only', () => {
      const existing = makeTask({ id: 'x', status: 'todo' });
      const updated = { ...existing, status: 'done' as const, updatedAt: 'ts' };
      repo.findById.mockReturnValue(existing);
      repo.update.mockReturnValue(updated);

      const result = service.update('x', { status: 'done' });

      expect(result.status).toBe('done');
    });

    it('updates both title and status', () => {
      const existing = makeTask({ id: 'x' });
      const updated = {
        ...existing,
        title: 'Updated',
        status: 'in_progress' as const,
        updatedAt: 'ts',
      };
      repo.findById.mockReturnValue(existing);
      repo.update.mockReturnValue(updated);

      const result = service.update('x', {
        title: 'Updated',
        status: 'in_progress',
      });

      expect(result.title).toBe('Updated');
      expect(result.status).toBe('in_progress');
    });

    it('throws NotFoundException when the task does not exist', () => {
      repo.findById.mockReturnValue(undefined);

      expect(() => service.update('missing', { title: 'x' })).toThrow(
        NotFoundException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws a 422 with VALIDATION_FAILED code on empty patch body', () => {
      let thrown: unknown;
      try {
        service.update('any', {});
      } catch (err) {
        thrown = err;
      }

      // Avoid importing HttpException's concrete type — assert via shape.
      expect(thrown).toBeDefined();
      const ex = thrown as {
        getStatus: () => number;
        getResponse: () => Record<string, unknown>;
      };
      expect(ex.getStatus()).toBe(422);
      const body = ex.getResponse();
      expect(body['error']).toBe('VALIDATION_FAILED');
      expect(repo.findById).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes an existing todo task without throwing', () => {
      repo.findById.mockReturnValue(makeTask({ status: 'todo' }));
      repo.delete.mockReturnValue(true);

      expect(() => service.remove('task-1')).not.toThrow();
      expect(repo.delete).toHaveBeenCalledWith('task-1');
    });

    it('deletes an existing done task without throwing', () => {
      repo.findById.mockReturnValue(makeTask({ status: 'done' }));
      repo.delete.mockReturnValue(true);

      expect(() => service.remove('task-1')).not.toThrow();
    });

    it('throws NotFoundException when the task does not exist', () => {
      repo.findById.mockReturnValue(undefined);

      expect(() => service.remove('missing')).toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException with TASK_IN_PROGRESS code when status is in_progress', () => {
      repo.findById.mockReturnValue(makeTask({ status: 'in_progress' }));

      expect(() => service.remove('task-1')).toThrow(ConflictException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('ConflictException carries TASK_IN_PROGRESS machine code', () => {
      repo.findById.mockReturnValue(makeTask({ status: 'in_progress' }));

      expect.assertions(1);
      let thrown: unknown;
      try {
        service.remove('task-1');
      } catch (err) {
        thrown = err;
      }
      const conflict = thrown as ConflictException;
      const body = conflict.getResponse() as Record<string, unknown>;
      expect(body['error']).toBe('TASK_IN_PROGRESS');
    });
  });
});
