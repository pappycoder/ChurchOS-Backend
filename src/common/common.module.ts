/**
 * @file common.module.ts
 * @description Shared module providing cross-cutting services and interceptors.
 *
 * Exports AuditLoggingService so it can be injected into any feature module.
 * The LoggingInterceptor is registered globally in main.ts instead of here
 * because interceptors don't need DI to be globally applied.
 *
 * Imports AuthModule so the AuditLogsController's JwtAuthGuard can resolve its
 * JwksService/RedisService dependencies (mirrors the CustomFieldsModule /
 * VisitorsModule fix for the same "can't resolve dependencies of the
 * JwtAuthGuard" boot error).
 *
 * @module common/common.module
 * @since 1.0.0
 */

import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';
import { AuditLoggingService } from './services/audit-logging.service';
import { RequestContextService } from './services/request-context.service';
import { BranchScopeService } from './services/branch-scope.service';
import { RequestContextMiddleware } from './middleware/request-context.middleware';
import { CacheInterceptor } from './interceptors/cache.interceptor';
import { CacheVersionInterceptor } from './interceptors/cache-version.interceptor';
import { AuditLogsController } from './audit-logs.controller';

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
  imports: [AuthModule],
  controllers: [AuditLogsController],
  providers: [
    AuditLoggingService,
    RequestContextService,
    BranchScopeService,
    CacheInterceptor,
    // Globally bumps each church's cache version after every write request so
    // cached analytics/reports responses are never stale (see CacheInterceptor).
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheVersionInterceptor,
    },
    // CacheInterceptor is available for injection but not global by default.
    // Controllers opt in via @UseInterceptors(CacheInterceptor) + @CacheTTL().
    // This pattern avoids caching all GET responses indiscriminately.
  ],
  exports: [AuditLoggingService, RequestContextService, BranchScopeService, CacheInterceptor],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
