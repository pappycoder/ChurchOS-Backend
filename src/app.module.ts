/**
 * @file app.module.ts
 * @description Root application module for the ChurchOS Backend API.
 *
 * The AppModule is the top-level module that NestJS loads when the application
 * starts. It imports and wires together all feature modules, global providers,
 * and middleware configured at the application level.
 *
 * Currently imports:
 * - ConfigModule: Loads and validates environment variables from `.env` files.
 *   Set as `isGlobal: true` so all modules can inject ConfigService.
 * - PrismaModule: Provides PrismaService for database access across the app.
 *   Set as global in its own module definition.
 *
 * As feature modules are built (auth, members, attendance, etc.), they will
 * be added to the `imports` array here.
 *
 * @module app.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Root application module.
 *
 * This module serves as the entry point for NestJS module resolution.
 * All feature modules, services, and controllers are resolved through this
 * module tree.
 *
 * @example
 * ```typescript
 * // NestJS automatically resolves this module when NestFactory.create(AppModule) is called.
 * // ConfigModule and PrismaModule are available application-wide.
 * ```
 */
@Module({
  imports: [
    // Step 1: Configure ConfigModule for environment variable management.
    // - isGlobal: true → Makes ConfigService injectable in any module without
    //   re-importing ConfigModule in each feature module.
    // - envFilePath: '.env' → Points to the local environment file.
    //   In production, environment variables are set via the hosting platform.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Step 2: Import the PrismaModule for database access.
    // PrismaModule is decorated with @Global(), so PrismaService is available
    // in any module that needs database operations without additional imports.
    PrismaModule,
  ],
  controllers: [], // Feature controllers will be registered here as they are built.
  providers: [], // App-level providers will be registered here if needed.
})
export class AppModule {}
