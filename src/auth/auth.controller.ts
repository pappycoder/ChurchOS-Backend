/**
 * @file auth.controller.ts
 * @description HTTP endpoints for authentication and profile management.
 *
 * Handles registration, login, logout, password management, profile updates,
 * and session refresh. All endpoints are documented via Swagger.
 *
 * @module auth/auth.controller
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RegisterResponseDto, ProfileResponseDto } from './dto/auth-response.dto';
import { LoginResponseDto, RefreshResponseDto } from './dto/session-response.dto';
import { CurrentUser, SupabaseUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';

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
  @ApiCreatedResponse({ description: 'Registration successful' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * Login with email and password.
   *
   * Returns JWT tokens and user profile. This is a public endpoint.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticates a user with email and password. Returns JWT access token, refresh token, and user profile.',
  })
  @ApiOkResponse({ description: 'Login successful', type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  /**
   * Logout the current user.
   *
   * Blacklists the JWT token in Redis so it can no longer be used.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('supabase-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout current user',
    description: 'Blacklists the current JWT token and logs the logout event.',
  })
  @ApiOkResponse({ description: 'Logout successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async logout(@CurrentUser() user: SupabaseUser, @Request() req: AuthenticatedRequest) {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    const churchId = req.profile?.church_id || '';
    await this.authService.logout(user.id, token, churchId);
    return { success: true };
  }

  /**
   * Request a password reset email.
   *
   * Always returns success to prevent email enumeration.
   * The email is sent via Supabase Auth with a reset link.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Sends a password reset email to the specified address. ' +
      'Always returns success to prevent email enumeration.',
  })
  @ApiOkResponse({ description: 'If the email exists, a reset link has been sent' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ success: boolean }> {
    await this.authService.forgotPassword(dto.email);
    return { success: true };
  }

  /**
   * Complete a password reset with a recovery token.
   *
   * The token is obtained from the password reset email link.
   */
  @Patch('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password with recovery token',
    description: 'Completes the password reset flow using the token from the email link.',
  })
  @ApiOkResponse({ description: 'Password reset successful' })
  @ApiBadRequestResponse({ description: 'Invalid or expired recovery token' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ success: boolean }> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { success: true };
  }

  /**
   * Change password for the authenticated user.
   *
   * Requires the current password for verification before setting the new one.
   */
  @Put('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('supabase-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change password',
    description:
      'Changes the password for the authenticated user. ' +
      'Requires current password for verification.',
  })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser() user: SupabaseUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
    await this.authService.changePassword(
      user.id,
      user.email || '',
      dto.currentPassword,
      dto.newPassword,
    );
    return { success: true };
  }

  /**
   * Update the current user's profile.
   *
   * Supports partial updates — only provided fields are updated.
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('supabase-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update current user profile',
    description: "Updates the authenticated user's profile. Only provided fields are updated.",
  })
  @ApiOkResponse({ description: 'Profile updated successfully', type: ProfileResponseDto })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async updateProfile(
    @CurrentUser() user: SupabaseUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.authService.updateProfile(user.id, dto);
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
  @ApiOkResponse({ description: 'Profile retrieved successfully', type: ProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async getMe(@CurrentUser() user: SupabaseUser): Promise<ProfileResponseDto> {
    return this.authService.getProfile(user.id);
  }

  /**
   * Refresh the current session tokens.
   *
   * Returns new access and refresh tokens.
   */
  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('supabase-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh session tokens',
    description: 'Refreshes the current session and returns new access and refresh tokens.',
  })
  @ApiOkResponse({ description: 'Session refreshed successfully', type: RefreshResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  async refreshSession(@Request() req: AuthenticatedRequest): Promise<RefreshResponseDto> {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken) {
      return this.authService.refreshSession(refreshToken);
    }
    return this.authService.refreshSession(refreshToken);
  }
}
