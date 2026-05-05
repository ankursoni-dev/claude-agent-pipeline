import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { PaginatedResponse } from '../../common/types/pagination.types';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TaskResponseDto } from './dto/task-response.dto';

@Controller({ path: 'tasks', version: '1' })
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /** Wire shape: wrapped by ResponseInterceptor as `{ data: TaskResponseDto }`. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTaskDto): TaskResponseDto {
    return this.tasksService.create(dto);
  }

  /** Wire shape passes through unchanged: `{ data: [...], meta: {...} }`. */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @Query() query: ListTasksQueryDto,
  ): PaginatedResponse<TaskResponseDto> {
    return this.tasksService.findAll(query.page, query.limit);
  }

  /** Wire shape: wrapped by ResponseInterceptor as `{ data: TaskResponseDto }`. */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): TaskResponseDto {
    return this.tasksService.findOne(id);
  }

  /** Wire shape: wrapped by ResponseInterceptor as `{ data: TaskResponseDto }`. */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateTaskDto,
  ): TaskResponseDto {
    return this.tasksService.update(id, dto);
  }

  /** Wire shape: 204 No Content, empty body (interceptor does not wrap void). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): void {
    this.tasksService.remove(id);
  }
}
