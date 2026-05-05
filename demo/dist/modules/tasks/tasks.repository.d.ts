import { Task, TaskRepository } from './task.interface';
export declare class InMemoryTaskRepository implements TaskRepository {
    private readonly store;
    findAll(): Task[];
    findById(id: string): Task | undefined;
    create(task: Task): Task;
    update(id: string, partial: Partial<Pick<Task, 'title' | 'status' | 'updatedAt'>>): Task | undefined;
    delete(id: string): boolean;
    count(): number;
}
