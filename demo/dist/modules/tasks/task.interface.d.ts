export type TaskStatus = 'todo' | 'in_progress' | 'done';
export interface Task {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    createdAt: string;
    updatedAt: string;
}
export interface TaskRepository {
    findAll(): Task[];
    findById(id: string): Task | undefined;
    create(task: Task): Task;
    update(id: string, partial: Partial<Pick<Task, 'title' | 'status' | 'updatedAt'>>): Task | undefined;
    delete(id: string): boolean;
    count(): number;
}
