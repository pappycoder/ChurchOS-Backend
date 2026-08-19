/**
 * @file sermons.module.ts
 * @description Sermons module for sermon archive management.
 *
 * @module sermons/sermons.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SermonsController } from './sermons.controller';
import { SermonsService } from './sermons.service';

/**
 * Sermons module providing sermon CRUD with search and filtering.
 */
@Module({
  imports: [AuthModule],
  controllers: [SermonsController],
  providers: [SermonsService],
  exports: [SermonsService],
})
export class SermonsModule {}
