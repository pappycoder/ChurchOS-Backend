/**
 * @file Church management module.
 * @module ChurchModule
 * @description Provides ChurchService and ChurchController for managing church details,
 * configuration, and staff invitation/management.
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { ChurchController } from './church.controller';
import { ChurchService } from './church.service';

/**
 * Module for church management operations.
 * Imports AuthModule for JWT authentication and MediaModule for file operations.
 * Exports ChurchService for use by other modules.
 */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ChurchController],
  providers: [ChurchService],
  exports: [ChurchService],
})
export class ChurchModule {}
