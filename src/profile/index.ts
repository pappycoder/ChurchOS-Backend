/**
 * @file index.ts
 * @description Barrel exports for the Profile module.
 *
 * Re-exports all public DTOs, service, controller, and module
 * for convenient importing by other modules.
 *
 * @module profile/index
 * @since 1.0.0
 */

export * from './profile.module';
export * from './profile.service';
export * from './profile.controller';
export * from './dto/update-profile.dto';
export * from './dto/update-role.dto';
export * from './dto/list-profiles.dto';
export * from './dto/profile-response.dto';
export * from './dto/verify-otp.dto';
