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
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { MediaModule } from './media/media.module';
import { ChurchModule } from './church/church.module';
import { BranchesModule } from './branches/branches.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ProfileModule } from './profile/profile.module';
import { GivingModule } from './giving/giving.module';
import { EventsModule } from './events/events.module';
import { SermonsModule } from './sermons/sermons.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { QueuesModule } from './queues/queues.module';
import { FamilyModule } from './family/family.module';
import { TemplatesModule } from './templates/templates.module';
import { CommunicationModule } from './communication/communication.module';
import { PastoralModule } from './pastoral/pastoral.module';
import { AdminModule } from './admin/admin.module';

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

    // Step 1b: Configure structured JSON logging with nestjs-pino.
    // Replaces the default NestJS logger with pino for structured JSON output.
    // In development, uses pino-pretty for human-readable logs.
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        level: process.env.LOG_LEVEL || 'info',
        autoLogging: false,
      },
    }),

    // Step 2: Import the PrismaModule for database access.
    // PrismaModule is decorated with @Global(), so PrismaService is available
    // in any module that needs database operations without additional imports.
    PrismaModule,

    // Step 3: Import CommonModule for shared services (AuditLoggingService).
    CommonModule,

    // Step 4: Import SupabaseModule for Supabase client access.
    SupabaseModule,

    // Step 5: Import AuthModule for JWT authentication.
    AuthModule,

    // Step 6: Import MembersModule for member management.
    MembersModule,

    // Step 7: Import MediaModule for file uploads and image optimization.
    MediaModule,

    // Step 8: Import ChurchModule for church CRUD and staff management.
    ChurchModule,

    // Step 9: Import BranchesModule for branch CRUD.
    BranchesModule,

    // Step 10: Import AttendanceModule for attendance and service management.
    AttendanceModule,

    // Step 11: Import ProfileModule for profile management and role updates.
    ProfileModule,

    // Step 12: Import GivingModule for giving categories, transactions, and receipts.
    GivingModule,

    // Step 13: Import EventsModule for event management and registration.
    EventsModule,

    // Step 14: Import SermonsModule for sermon archive.
    SermonsModule,

    // Step 15: Import WhatsAppModule for WhatsApp integration.
    WhatsAppModule,

    // Step 16: Import RedisModule for caching and queues.
    RedisModule,

    // Step 17: Import HealthModule for health check endpoint.
    HealthModule,

    // Step 18: Import QueuesModule for BullMQ background job queues.
    QueuesModule,

    // Step 19: Import FamilyModule for family management.
    FamilyModule,

    // Step 20: Import TemplatesModule for message templates.
    TemplatesModule,

    // Step 21: Import CommunicationModule for email (Resend) and SMS (Termii).
    CommunicationModule,

    // Step 22: Import PastoralModule for pastoral notes with encrypted storage.
    PastoralModule,

    // Step 23: Import AdminModule for department and cell group management.
    AdminModule,
  ],
  controllers: [], // Feature controllers will be registered here as they are built.
  providers: [], // App-level providers will be registered here if needed.
})
export class AppModule {}
