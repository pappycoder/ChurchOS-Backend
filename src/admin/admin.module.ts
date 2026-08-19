/**
 * @file admin.module.ts
 * @description NestJS module for admin operations (departments, cell groups).
 *
 * Provides AdminService and AdminController for managing departments
 * with hierarchical structure and member assignments, and cell groups
 * with nearest-group geolocation recommendations.
 *
 * @module admin/admin.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PastoralModule } from '../pastoral/pastoral.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  // Import AuthModule for JWT guards and role-based access control
  // Import PastoralModule for ScoringService used in dashboard endpoints
  imports: [AuthModule, PastoralModule],
  // Register AdminController to handle HTTP routes
  controllers: [AdminController],
  // Register AdminService as a provider for dependency injection
  providers: [AdminService],
  // Export AdminService so other modules can use it
  exports: [AdminService],
})
export class AdminModule {}
