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
import { FormsModule } from '../forms/forms.module';
import { OfflineController } from './offline.controller';
import { OfflineService } from './offline.service';

@Module({
  imports: [AuthModule, FormsModule],
  controllers: [SyncController, OfflineController],
  providers: [SyncService, OfflineService],
  exports: [SyncService],
})
export class SyncModule {}
