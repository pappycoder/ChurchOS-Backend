/**
 * @file assets.module.ts
 * @description NestJS module for asset and inventory management.
 *
 * Provides AssetsService and AssetsController for managing asset categories,
 * asset register, maintenance, depreciation, loans, QR codes, and scans.
 *
 * @module assets/assets.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [AuthModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
