"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let HttpExceptionFilter = class HttpExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const statusCode = exception.getStatus();
        const exceptionResponse = exception.getResponse();
        const body = {
            statusCode,
            error: this.toMachineCode(statusCode, exceptionResponse),
            message: this.extractMessage(exceptionResponse),
            timestamp: new Date().toISOString(),
            path: request.url,
        };
        if (statusCode === common_1.HttpStatus.UNPROCESSABLE_ENTITY) {
            const validationErrors = this.extractValidationErrors(exceptionResponse);
            if (validationErrors.length > 0) {
                body.errors = validationErrors;
            }
        }
        response.status(statusCode).json(body);
    }
    toMachineCode(statusCode, exceptionResponse) {
        if (typeof exceptionResponse === 'object' &&
            exceptionResponse !== null &&
            'error' in exceptionResponse) {
            const raw = exceptionResponse['error'];
            if (typeof raw === 'string' && /^[A-Z][A-Z0-9_]+$/.test(raw)) {
                return raw;
            }
        }
        const map = {
            400: 'BAD_REQUEST',
            401: 'UNAUTHORIZED',
            403: 'FORBIDDEN',
            404: 'NOT_FOUND',
            409: 'CONFLICT',
            422: 'VALIDATION_FAILED',
            429: 'TOO_MANY_REQUESTS',
            500: 'INTERNAL_SERVER_ERROR',
        };
        return map[statusCode] ?? 'HTTP_ERROR';
    }
    extractMessage(exceptionResponse) {
        if (typeof exceptionResponse === 'string')
            return exceptionResponse;
        const res = exceptionResponse;
        if (Array.isArray(res['message'])) {
            return 'Validation failed';
        }
        if (typeof res['message'] === 'string')
            return res['message'];
        return 'An error occurred';
    }
    extractValidationErrors(exceptionResponse) {
        if (typeof exceptionResponse !== 'object' || exceptionResponse === null) {
            return [];
        }
        const res = exceptionResponse;
        if (!Array.isArray(res['message']))
            return [];
        return res['message'].map((msg) => {
            const parts = msg.split(' ');
            return { field: parts[0] ?? 'unknown', message: msg };
        });
    }
};
exports.HttpExceptionFilter = HttpExceptionFilter;
exports.HttpExceptionFilter = HttpExceptionFilter = __decorate([
    (0, common_1.Catch)(common_1.HttpException)
], HttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map