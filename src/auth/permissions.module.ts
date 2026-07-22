/**
 * @file permissions.module.ts
 * @description Module for managing role-based permissions with church-specific overrides.
 *
 * Provides PermissionsService for resolving effective permissions and
 * PermissionsController for church admin management endpoints.
 *
 * @module auth/permissions.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { PermissionsService } from './services/permissions.service';
import { PermissionsController } from './permissions.controller';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
