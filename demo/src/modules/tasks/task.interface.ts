export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PageRequest {
  page: number;
  limit: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface TaskRepository {
  /**
   * Returns a single page of tasks plus the total row count.
   * Results are returned in insertion order (the order in which `create`
   * was first called for each row). Returned objects are defensive copies —
   * mutating them does not affect the underlying store.
   */
  findPage(request: PageRequest): Page<Task>;

  /**
   * Returns a defensive copy of the task or `undefined` if not found.
   */
  findById(id: string): Task | undefined;

  create(task: Task): Task;

  update(
    id: string,
    partial: Partial<Pick<Task, 'title' | 'status' | 'updatedAt'>>,
  ): Task | undefined;

  delete(id: string): boolean;
}
