"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const class_transformer_1 = require("class-transformer");
const tasks_tokens_1 = require("./tasks.tokens");
const task_response_dto_1 = require("./dto/task-response.dto");
let TasksService = class TasksService {
    taskRepository;
    constructor(taskRepository) {
        this.taskRepository = taskRepository;
    }
    create(dto) {
        const now = new Date().toISOString();
        const task = {
            id: crypto.randomUUID(),
            title: dto.title,
            description: dto.description,
            status: dto.status ?? 'todo',
            createdAt: now,
            updatedAt: now,
        };
        const saved = this.taskRepository.create(task);
        return (0, class_transformer_1.plainToInstance)(task_response_dto_1.TaskResponseDto, saved, {
            excludeExtraneousValues: true,
        });
    }
    findAll(page, limit) {
        const all = this.taskRepository.findAll();
        const total = all.length;
        const start = (page - 1) * limit;
        const slice = all.slice(start, start + limit);
        const data = slice.map((t) => (0, class_transformer_1.plainToInstance)(task_response_dto_1.TaskResponseDto, t, { excludeExtraneousValues: true }));
        return { data, meta: { page, limit, total } };
    }
    findOne(id) {
        const task = this.taskRepository.findById(id);
        if (!task) {
            throw new common_1.NotFoundException(`Task with id "${id}" not found`);
        }
        return (0, class_transformer_1.plainToInstance)(task_response_dto_1.TaskResponseDto, task, {
            excludeExtraneousValues: true,
        });
    }
    update(id, dto) {
        const existing = this.taskRepository.findById(id);
        if (!existing) {
            throw new common_1.NotFoundException(`Task with id "${id}" not found`);
        }
        const updated = this.taskRepository.update(id, {
            ...(dto.title !== undefined ? { title: dto.title } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            updatedAt: new Date().toISOString(),
        });
        if (!updated) {
            throw new common_1.NotFoundException(`Task with id "${id}" not found`);
        }
        return (0, class_transformer_1.plainToInstance)(task_response_dto_1.TaskResponseDto, updated, {
            excludeExtraneousValues: true,
        });
    }
    remove(id) {
        const task = this.taskRepository.findById(id);
        if (!task) {
            throw new common_1.NotFoundException(`Task with id "${id}" not found`);
        }
        if (task.status === 'in_progress') {
            throw new common_1.ConflictException({
                error: 'TASK_IN_PROGRESS',
                message: 'Cannot delete a task that is currently in progress. Change its status first.',
            });
        }
        this.taskRepository.delete(id);
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(tasks_tokens_1.TASK_REPOSITORY)),
    __metadata("design:paramtypes", [Object])
], TasksService);
//# sourceMappingURL=tasks.service.js.map