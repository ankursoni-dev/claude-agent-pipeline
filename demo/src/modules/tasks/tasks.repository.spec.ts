import { InMemoryTaskRepository } from './tasks.repository';
import { Task } from './task.interface';

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

describe('InMemoryTaskRepository', () => {
  let repo: InMemoryTaskRepository;

  beforeEach(() => {
    repo = new InMemoryTaskRepository();
  });

  describe('findPage', () => {
    it('returns rows in insertion order', () => {
      ['a', 'b', 'c'].forEach((id) =>
        repo.create(makeTask({ id, title: id })),
      );

      const { rows, total } = repo.findPage({ page: 1, limit: 10 });

      expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
      expect(total).toBe(3);
    });

    it('slices correctly for the second page', () => {
      ['a', 'b', 'c', 'd', 'e'].forEach((id) =>
        repo.create(makeTask({ id, title: id })),
      );

      const { rows, total } = repo.findPage({ page: 2, limit: 2 });

      expect(rows.map((r) => r.id)).toEqual(['c', 'd']);
      expect(total).toBe(5);
    });

    it('returns empty rows but accurate total when page is beyond range', () => {
      ['a', 'b', 'c', 'd', 'e'].forEach((id) =>
        repo.create(makeTask({ id, title: id })),
      );

      const { rows, total } = repo.findPage({ page: 99, limit: 10 });

      expect(rows).toEqual([]);
      expect(total).toBe(5);
    });

    it('returns empty rows and total 0 when the store is empty', () => {
      const { rows, total } = repo.findPage({ page: 1, limit: 10 });

      expect(rows).toEqual([]);
      expect(total).toBe(0);
    });

    it('returns defensive copies — mutating returned rows does not affect subsequent reads', () => {
      repo.create(makeTask({ id: 'a', title: 'Original' }));

      const first = repo.findPage({ page: 1, limit: 10 });
      first.rows[0].title = 'Mutated';

      const second = repo.findPage({ page: 1, limit: 10 });
      expect(second.rows[0].title).toBe('Original');
    });
  });

  describe('findById', () => {
    it('returns a defensive copy', () => {
      repo.create(makeTask({ id: 'x', title: 'Pristine' }));

      const first = repo.findById('x');
      first!.title = 'Mutated';

      const second = repo.findById('x');
      expect(second!.title).toBe('Pristine');
    });

    it('returns undefined when not found', () => {
      expect(repo.findById('missing')).toBeUndefined();
    });
  });

  describe('create / update / delete', () => {
    it('round-trips a created task via findById', () => {
      const task = makeTask({ id: 'r1' });
      repo.create(task);

      expect(repo.findById('r1')).toMatchObject({ id: 'r1' });
    });

    it('update returns the updated task and persists changes', () => {
      repo.create(makeTask({ id: 'u1', title: 'Old' }));

      const updated = repo.update('u1', { title: 'New', updatedAt: 'ts' });

      expect(updated).toMatchObject({ title: 'New', updatedAt: 'ts' });
      expect(repo.findById('u1')).toMatchObject({ title: 'New' });
    });

    it('update returns undefined when not found and does not insert', () => {
      const result = repo.update('nope', { title: 'x' });

      expect(result).toBeUndefined();
      expect(repo.findById('nope')).toBeUndefined();
    });

    it('delete returns true on hit and false on miss', () => {
      repo.create(makeTask({ id: 'd1' }));

      expect(repo.delete('d1')).toBe(true);
      expect(repo.delete('d1')).toBe(false);
      expect(repo.findById('d1')).toBeUndefined();
    });
  });
});
