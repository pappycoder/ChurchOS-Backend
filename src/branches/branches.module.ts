/**
 * @file Branch management module.
 * @module BranchesModule
 * @description Provides BranchesService and BranchesController for managing church branches
 * with full CRUD operations, multi-tenant isolation, and audit logging.
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

/**
 * Module for branch management operations.
 * Imports AuthModule for JWT authentication and MediaModule for file operations.
 * Exports BranchesService for use by other modules.
 */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
