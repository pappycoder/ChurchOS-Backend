/**
 * @file auth.controller.ts
 * @description HTTP endpoints for authentication and profile management.
 *
 * @module auth/auth.controller
 * @since 1.0.0
 */

import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto, ProfileResponseDto } from './dto/auth-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new church admin account.
   *
   * Creates a Supabase Auth user, a Church record, and an admin Profile.
   * This is a public endpoint — no authentication required.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new church admin',
    description:
      'Creates a new user account, church, and admin profile. ' +
      'Returns the user ID, profile ID, and church ID.',
  })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * Get the current authenticated user's profile.
   *
   * Returns the full profile including church and branch details.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('supabase-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      "Returns the authenticated user's ChurchOS profile with church and branch details.",
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getMe(@CurrentUser() user: SupabaseUser): Promise<ProfileResponseDto> {
    return this.authService.getProfile(user.id);
  }
}
