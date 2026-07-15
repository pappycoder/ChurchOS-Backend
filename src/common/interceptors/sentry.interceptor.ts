/**
 * @file sentry.interceptor.ts
 * @description NestJS interceptor for Sentry error tracking.
 *
 * Captures unhandled exceptions and sends them to Sentry with full context.
 * Only active when SENTRY_DSN is configured — no-op in development.
 *
 * @module common/interceptors/sentry.interceptor
 * @since 1.0.0
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as Sentry from '@sentry/nestjs';
import { Request, Response } from 'express';

/**
 * Interceptor that captures exceptions and reports them to Sentry.
 *
 * @example
 * // Registered globally in main.ts (only active when SENTRY_DSN is set):
 * app.useGlobalInterceptors(new SentryInterceptor());
 */
@Injectable()
export class SentryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SentryInterceptor.name);
  private readonly isActive: boolean;

  constructor() {
    this.isActive = !!process.env.SENTRY_DSN;
    if (this.isActive) {
      this.logger.log('Sentry error tracking enabled');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.isActive) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      catchError((error) => {
        Sentry.withScope((scope) => {
          scope.setTag('method', request.method);
          scope.setTag('url', request.url);
          scope.setTag('status_code', context.switchToHttp().getResponse<Response>().statusCode);

          if (request.user) {
            scope.setUser({
              id: (request.user as Record<string, unknown>).sub as string,
            });
          }

          scope.setExtras({
            headers: request.headers,
            query: request.query,
            body: request.body,
          });

          Sentry.captureException(error);
        });

        return throwError(() => error);
      }),
    );
  }
}
