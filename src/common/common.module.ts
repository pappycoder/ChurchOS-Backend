/**
 * @file common.module.ts
 * @description Shared module providing cross-cutting services and interceptors.
 *
 * Exports AuditLoggingService so it can be injected into any feature module.
 * The LoggingInterceptor is registered globally in main.ts instead of here
 * because interceptors don't need DI to be globally applied.
 *
 * @module common/common.module
 * @since 1.0.0
 */

import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';

import { AuditLoggingService } from './services/audit-logging.service';
import { RequestContextService } from './services/request-context.service';
import { RequestContextMiddleware } from './middleware/request-context.middleware';
import { CacheInterceptor } from './interceptors/cache.interceptor';

/**
 * Global module providing shared services and middleware.
 *
 * @example
 * // Imported automatically via @Global() — available in all modules:
 * constructor(
 *   private readonly audit: AuditLoggingService,
 *   private readonly requestContext: RequestContextService,
 * ) {}
 */
@Global()
@Module({
  providers: [
    AuditLoggingService,
    RequestContextService,
    CacheInterceptor,
    // CacheInterceptor is available for injection but not global by default.
    // Controllers opt in via @UseInterceptors(CacheInterceptor) + @CacheTTL().
    // This pattern avoids caching all GET responses indiscriminately.
  ],
  exports: [AuditLoggingService, RequestContextService, CacheInterceptor],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
