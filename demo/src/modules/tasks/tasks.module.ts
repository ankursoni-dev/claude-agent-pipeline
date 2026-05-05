import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { InMemoryTaskRepository } from './tasks.repository';
import { TASK_REPOSITORY } from './tasks.tokens';

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    {
      provide: TASK_REPOSITORY,
      useClass: InMemoryTaskRepository,
    },
  ],
})
export class TasksModule {}
