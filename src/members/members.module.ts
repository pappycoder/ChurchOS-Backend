/**
 * @file members.module.ts
 * @description NestJS module for church member management.
 *
 * Registers the MembersController and MembersService.
 * Imports AuthModule for JwtAuthGuard dependency.
 *
 * @module members/members.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [AuthModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
