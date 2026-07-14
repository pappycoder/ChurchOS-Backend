/**
 * @file index.ts
 * @description Barrel export for the Prisma module.
 *
 * This file re-exports all public symbols from the prisma module so that
 * consumers can import from the module directory directly instead of
 * specifying individual file paths.
 *
 * @example
 * ```typescript
 * // Instead of:
 * import { PrismaService } from './prisma/prisma.service';
 * import { PrismaModule } from './prisma/prisma.module';
 *
 * // Use:
 * import { PrismaService, PrismaModule } from './prisma';
 * ```
 *
 * @module prisma
 * @since 1.0.0
 */

export { PrismaModule } from './prisma.module';
export { PrismaService } from './prisma.service';
