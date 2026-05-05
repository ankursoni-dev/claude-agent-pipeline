import type { TaskRepository } from './task.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import type { PaginatedResponse } from '../../common/types/pagination.types';
export declare class TasksService {
    private readonly taskRepository;
    constructor(taskRepository: TaskRepository);
    create(dto: CreateTaskDto): TaskResponseDto;
    findAll(page: number, limit: number): PaginatedResponse<TaskResponseDto>;
    findOne(id: string): TaskResponseDto;
    update(id: string, dto: UpdateTaskDto): TaskResponseDto;
    remove(id: string): void;
}
