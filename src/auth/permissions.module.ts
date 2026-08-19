/**
 * @file permissions.module.ts
 * @description Module for managing role-based permissions with church-specific overrides.
 *
 * Provides PermissionsService for resolving effective permissions.
 * The PermissionsController is registered in AuthModule to avoid circular
 * dependency (PermissionsController needs JwtAuthGuard from AuthModule).
 *
 * @module auth/permissions.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { PermissionsService } from './services/permissions.service';

@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
