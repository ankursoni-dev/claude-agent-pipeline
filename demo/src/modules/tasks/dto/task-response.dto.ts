import { Exclude, Expose } from 'class-transformer';
import type { TaskStatus } from '../task.interface';

@Exclude()
export class TaskResponseDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  description?: string;

  @Expose()
  status: TaskStatus;

  @Expose()
  createdAt: string;

  @Expose()
  updatedAt: string;
}
