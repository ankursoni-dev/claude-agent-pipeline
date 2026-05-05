import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import type { Task, TaskRepository } from './task.interface';
import { TASK_REPOSITORY } from './tasks.tokens';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import type { PaginatedResponse } from '../../common/types/pagination.types';

@Injectable()
export class TasksService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: TaskRepository,
  ) {}

  create(dto: CreateTaskDto): TaskResponseDto {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      title: dto.title,
      description: dto.description,
      status: dto.status ?? 'todo',
      createdAt: now,
      updatedAt: now,
    };
    const saved = this.taskRepository.create(task);
    return plainToInstance(TaskResponseDto, saved, {
      excludeExtraneousValues: true,
    });
  }

  findAll(
    page: number,
    limit: number,
  ): PaginatedResponse<TaskResponseDto> {
    const { rows, total } = this.taskRepository.findPage({ page, limit });
    const data = rows.map((row) =>
      plainToInstance(TaskResponseDto, row, { excludeExtraneousValues: true }),
    );
    return { data, meta: { page, limit, total } };
  }

  findOne(id: string): TaskResponseDto {
    const task = this.taskRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }
    return plainToInstance(TaskResponseDto, task, {
      excludeExtraneousValues: true,
    });
  }

  update(id: string, dto: UpdateTaskDto): TaskResponseDto {
    if (dto.title === undefined && dto.status === undefined) {
      // Class-validator can't easily express "at least one of these is
      // required" at the DTO level, so we enforce it here. Surface as a 422
      // with the same envelope shape as other validation failures.
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'VALIDATION_FAILED',
          message: 'at least one of title, status is required',
          errors: [
            {
              field: 'body',
              message: 'at least one of title, status is required',
            },
          ],
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const existing = this.taskRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }
    const updated = this.taskRepository.update(id, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedAt: new Date().toISOString(),
    });
    // updated cannot be undefined here since we verified existence above,
    // but TypeScript does not know that — handle defensively
    if (!updated) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }
    return plainToInstance(TaskResponseDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  remove(id: string): void {
    const task = this.taskRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }
    if (task.status === 'in_progress') {
      throw new ConflictException({
        error: 'TASK_IN_PROGRESS',
        message:
          'Cannot delete a task that is currently in progress. Change its status first.',
      });
    }
    this.taskRepository.delete(id);
  }
}
