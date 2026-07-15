/**
 * @file logging.interceptor.ts
 * @description NestJS interceptor for structured request/response logging.
 *
 * Logs every incoming HTTP request with:
 * - Method, URL, status code
 * - Response time in milliseconds
 * - User agent and IP (for audit trail)
 * - Request ID for tracing
 *
 * Uses NestJS Logger for output (integrates with any LoggerService).
 *
 * @module common/interceptors/logging.interceptor
 * @since 1.0.0
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Interceptor that logs all HTTP requests with timing and metadata.
 *
 * @example
 * // Registered globally in main.ts:
 * app.useGlobalInterceptors(new LoggingInterceptor());
 *
 * // Output:
 * // [LOG] GET /api/v1/members 200 45ms - user_agent: Mozilla/5.0...
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const requestId = randomUUID();

    // Attach request ID to response header for tracing
    response.setHeader('X-Request-Id', requestId);

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const { statusCode } = response;
          const duration = Date.now() - startTime;

          this.logger.log(
            `${method} ${url} ${statusCode} ${duration}ms - ${ip} - ${userAgent} - ${requestId}`,
          );
        },
        error: (error) => {
          const statusCode = response.statusCode || 500;
          const duration = Date.now() - startTime;

          this.logger.error(
            `${method} ${url} ${statusCode} ${duration}ms - ${ip} - ${userAgent} - ${requestId}`,
            error instanceof Error ? error.stack : String(error),
          );
        },
      }),
    );
  }
}
