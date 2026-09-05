/**
 * @file family.module.ts
 * @description Family management module for grouping church members into households.
 *
 * Provides FamilyService and FamilyController for managing families
 * and their member associations. Imports AuthModule for JWT authentication.
 *
 * @module family/family.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';

@Module({
  imports: [AuthModule],
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
