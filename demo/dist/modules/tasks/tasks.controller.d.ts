import type { PaginatedResponse } from '../../common/types/pagination.types';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TaskResponseDto } from './dto/task-response.dto';
export declare class TasksController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    create(dto: CreateTaskDto): TaskResponseDto;
    findAll(query: ListTasksQueryDto): PaginatedResponse<TaskResponseDto>;
    findOne(id: string): TaskResponseDto;
    update(id: string, dto: UpdateTaskDto): TaskResponseDto;
    remove(id: string): void;
}
