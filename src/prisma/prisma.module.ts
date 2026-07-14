/**
 * @file prisma.module.ts
 * @description Global Prisma module for database access.
 *
 * This module registers PrismaService as both a provider and an export,
 * making it available for dependency injection across all modules in the
 * application without needing to import PrismaModule in each feature module.
 *
 * The @Global() decorator ensures that PrismaService can be injected anywhere
 * in the application's module tree.
 *
 * @module prisma/prisma.module
 * @since 1.0.0
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global PrismaModule.
 *
 * Provides PrismaService application-wide. Any module can inject PrismaService
 * via its constructor without explicitly importing PrismaModule.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class AuthService {
 *   constructor(private readonly prisma: PrismaService) {}
 *   // prisma is now available for database queries
 * }
 * ```
 */
@Global()
@Module({
  providers: [PrismaService], // Register PrismaService for DI resolution
  exports: [PrismaService], // Export so other modules can inject it
})
export class PrismaModule {}
