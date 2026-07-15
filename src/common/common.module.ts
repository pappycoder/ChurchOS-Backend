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

import { Module, Global } from '@nestjs/common';
import { AuditLoggingService } from './services/audit-logging.service';

/**
 * Global module providing shared services.
 *
 * @example
 * // Imported automatically via @Global() — available in all modules:
 * constructor(private readonly audit: AuditLoggingService) {}
 */
@Global()
@Module({
  providers: [AuditLoggingService],
  exports: [AuditLoggingService],
})
export class CommonModule {}
