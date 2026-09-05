/**
 * @file sync.module.ts
 * @description Offline data synchronization module.
 *
 * @module sync/sync.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
