import type { TaskStatus } from '../task.interface';
export declare class TaskResponseDto {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    createdAt: string;
    updatedAt: string;
}
