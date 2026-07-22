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
import { BroadcastModule } from './broadcast/broadcast.module';
import { CommunicationModule } from './communication/communication.module';
import { PastoralModule } from './pastoral/pastoral.module';
import { AdminModule } from './admin/admin.module';
import { AssetsModule } from './assets/assets.module';
import { FormsModule } from './forms/forms.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { VisitorsModule } from './visitors/visitors.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SyncModule } from './sync/sync.module';
import { ReportsModule } from './reports/reports.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { PermissionsModule } from './auth/permissions.module';

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
    // Configure ConfigModule for environment variable management.
    // - isGlobal: true → Makes ConfigService injectable in any module without
    //   re-importing ConfigModule in each feature module.
    // - envFilePath: '.env' → Points to the local environment file.
    //   In production, environment variables are set via the hosting platform.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Configure structured JSON logging with nestjs-pino.
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

    // Import the PrismaModule for database access.
    // PrismaModule is decorated with @Global(), so PrismaService is available
    // in any module that needs database operations without additional imports.
    PrismaModule,

    // Import CommonModule for shared services (AuditLoggingService).
    CommonModule,

    // Import SupabaseModule for Supabase client access.
    SupabaseModule,

    // Import AuthModule for JWT authentication.
    AuthModule,

    // Import MembersModule for member management.
    MembersModule,

    // Import MediaModule for file uploads and image optimization.
    MediaModule,

    // Import ChurchModule for church CRUD and staff management.
    ChurchModule,

    // Import BranchesModule for branch CRUD.
    BranchesModule,

    // Import AttendanceModule for attendance and service management.
    AttendanceModule,

    // Import ProfileModule for profile management and role updates.
    ProfileModule,

    // Import GivingModule for giving categories, transactions, and receipts.
    GivingModule,

    // Import EventsModule for event management and registration.
    EventsModule,

    // Import SermonsModule for sermon archive.
    SermonsModule,

    // Import WhatsAppModule for WhatsApp integration.
    WhatsAppModule,

    // Import RedisModule for caching and queues.
    RedisModule,

    // Import HealthModule for health check endpoint.
    HealthModule,

    // Import QueuesModule for BullMQ background job queues.
    QueuesModule,

    // Import FamilyModule for family management.
    FamilyModule,

    // Import TemplatesModule for message templates.
    TemplatesModule,

    // Import BroadcastModule for broadcast messaging campaigns.
    BroadcastModule,

    // Import CommunicationModule for email (Resend) and SMS (Termii).
    CommunicationModule,

    // Import PastoralModule for pastoral notes with encrypted storage.
    PastoralModule,

    // Import AdminModule for department and cell group management.
    AdminModule,

    // Import AssetsModule for asset and inventory management.
    AssetsModule,

    // Import FormsModule for form and submission management.
    FormsModule,

    // Import AnalyticsModule for cross-domain analytics and reporting.
    AnalyticsModule,

    // Import CustomFieldsModule for church-specific custom field definitions.
    CustomFieldsModule,

    // Import VisitorsModule for visitor tracking and conversion funnel.
    VisitorsModule,

    // Import UsersModule for user management (staff accounts).
    UsersModule,

    // Import NotificationsModule for in-app notification management.
    NotificationsModule,

    // Import SyncModule for offline data synchronization.
    SyncModule,

    // Import ReportsModule for church report generation.
    ReportsModule,

    // Import WebhooksModule for outbound webhook management.
    WebhooksModule,

    // Import PermissionsModule for role-based permission resolution
    PermissionsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: 'APP_GUARD',
      useClass: RateLimitGuard,
    },
    {
      provide: 'APP_GUARD',
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
