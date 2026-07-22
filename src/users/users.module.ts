/**
 * @file users.module.ts
 * @description User management module.
 *
 * Provides admin-facing user management capabilities including
 * listing, inviting, deactivating, and managing church staff accounts.
 *
 * @module users/users.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
