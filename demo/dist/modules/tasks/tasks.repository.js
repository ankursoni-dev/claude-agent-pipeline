"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryTaskRepository = void 0;
const common_1 = require("@nestjs/common");
let InMemoryTaskRepository = class InMemoryTaskRepository {
    store = new Map();
    findAll() {
        return Array.from(this.store.values());
    }
    findById(id) {
        return this.store.get(id);
    }
    create(task) {
        this.store.set(task.id, task);
        return task;
    }
    update(id, partial) {
        const existing = this.store.get(id);
        if (!existing)
            return undefined;
        const updated = { ...existing, ...partial };
        this.store.set(id, updated);
        return updated;
    }
    delete(id) {
        return this.store.delete(id);
    }
    count() {
        return this.store.size;
    }
};
exports.InMemoryTaskRepository = InMemoryTaskRepository;
exports.InMemoryTaskRepository = InMemoryTaskRepository = __decorate([
    (0, common_1.Injectable)()
], InMemoryTaskRepository);
//# sourceMappingURL=tasks.repository.js.map