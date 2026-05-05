import type { TaskStatus } from '../task.interface';
export declare class CreateTaskDto {
    title: string;
    description?: string;
    status?: TaskStatus;
}
