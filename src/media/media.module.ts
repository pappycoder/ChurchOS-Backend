/**
 * @file Media module for file upload and management.
 * @module MediaModule
 * @description Provides MediaService and MediaController for handling file uploads,
 * image optimization, and deletion from Supabase Storage.
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

/**
 * Module for media operations.
 * Imports AuthModule for JWT authentication.
 * Exports MediaService for use by other modules.
 */
@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
