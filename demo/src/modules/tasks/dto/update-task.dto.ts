import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { TaskStatus } from '../task.interface';

/**
 * NOTE on emptiness: class-validator can mark all fields optional individually,
 * but cannot easily express "at least one is required" without a class-level
 * constraint. We enforce that rule in the service layer and surface it as a
 * 422 to keep the response contract consistent with other validation errors.
 * See `TasksService.update`.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(['todo', 'in_progress', 'done'] as const)
  status?: TaskStatus;
}
