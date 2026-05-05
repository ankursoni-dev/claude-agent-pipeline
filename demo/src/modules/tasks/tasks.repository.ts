import { Injectable } from '@nestjs/common';
import {
  Page,
  PageRequest,
  Task,
  TaskRepository,
} from './task.interface';

@Injectable()
export class InMemoryTaskRepository implements TaskRepository {
  private readonly store = new Map<string, Task>();

  /**
   * Returns the page slice plus total. Insertion order is preserved by
   * the underlying `Map`. Defensive shallow copies prevent callers from
   * mutating store rows.
   */
  findPage({ page, limit }: PageRequest): Page<Task> {
    const all = Array.from(this.store.values());
    const total = all.length;
    const start = (page - 1) * limit;
    const slice = all.slice(start, start + limit);
    return {
      rows: slice.map((task) => ({ ...task })),
      total,
    };
  }

  findById(id: string): Task | undefined {
    const task = this.store.get(id);
    return task ? { ...task } : undefined;
  }

  create(task: Task): Task {
    this.store.set(task.id, task);
    return { ...task };
  }

  update(
    id: string,
    partial: Partial<Pick<Task, 'title' | 'status' | 'updatedAt'>>,
  ): Task | undefined {
    const existing = this.store.get(id);
    if (!existing) return undefined;
    const updated: Task = { ...existing, ...partial };
    this.store.set(id, updated);
    return { ...updated };
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }
}
