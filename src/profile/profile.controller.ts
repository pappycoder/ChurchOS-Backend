/**
 * @file profile.controller.ts
 * @description HTTP endpoints for profile management.
 *
 * Provides endpoints for self-service profile updates, photo upload,
 * profile listing, role management, and soft-delete.
 * All endpoints require JWT authentication.
 *
 * @module profile/profile.controller
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { CurrentUser, SupabaseUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import {
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiDeleteEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ListProfilesDto } from './dto/list-profiles.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import { MfaSecretResponseDto } from './dto/mfa-secret-response.dto';
import { MulterFile } from '../media/media.service';

/**
 * Controller for profile management.
 * Provides endpoints for self-service profile updates, photo upload,
 * admin role management, and profile listing.
 */
@ApiTags('Profiles')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * Get the current authenticated user's profile.
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: "Returns the authenticated user's full profile with church and branch details.",
  })
  @ApiOkResponse({ description: 'Profile retrieved successfully', type: ProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async getMe(@CurrentUser() user: SupabaseUser): Promise<ProfileResponseDto> {
    return this.profileService.getMyProfile(user.sub);
  }

  /**
   * Update the current user's profile (partial updates).
   */
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiUpdateEndpoint(
    'Update current user profile',
    "Updates the authenticated user's profile. Only provided fields are updated.",
  )
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async updateMe(
    @CurrentUser() user: SupabaseUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profileService.updateMyProfile(user.sub, dto);
  }

  /**
   * Upload a profile photo (avatar).
   */
  @Post('me/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Profile photo (JPEG, PNG, WebP, GIF, AVIF)',
        },
      },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Upload profile photo',
    description:
      'Uploads and sets a profile photo. Previous photo is deleted from storage. Images are optimized to WebP.',
  })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async uploadPhoto(
    @CurrentUser() user: SupabaseUser,
    @UploadedFile() file: MulterFile,
    @Request() req: AuthenticatedRequest,
  ): Promise<ProfileResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.profileService.uploadProfilePhoto(user.sub, file, churchId);
  }

  /**
   * Generate a TOTP secret for MFA setup.
   */
  @Post('me/mfa/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate MFA secret',
    description: 'Generates a TOTP secret and returns an otpauth:// URI for QR code scanning.',
  })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async generateMfa(@CurrentUser() user: SupabaseUser): Promise<MfaSecretResponseDto> {
    return this.profileService.generateMfaSecret(user.sub);
  }

  /**
   * Enable MFA after verifying the TOTP code.
   */
  @Post('me/mfa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enable MFA',
    description: 'Verifies the TOTP code and enables MFA on the account.',
  })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async enableMfa(
    @CurrentUser() user: SupabaseUser,
    @Body() dto: VerifyMfaDto,
  ): Promise<ProfileResponseDto> {
    return this.profileService.enableMfa(user.sub, dto.code);
  }

  /**
   * Disable MFA after verifying the TOTP code.
   */
  @Post('me/mfa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable MFA',
    description: 'Verifies the current TOTP code and disables MFA on the account.',
  })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async disableMfa(
    @CurrentUser() user: SupabaseUser,
    @Body() dto: VerifyMfaDto,
  ): Promise<ProfileResponseDto> {
    return this.profileService.disableMfa(user.sub, dto.code);
  }

  /**
   * List all profiles for the church (paginated, filterable).
   */
  @Get()
  @ApiPaginatedResponse(ProfileResponseDto)
  @ApiOperation({
    summary: 'List profiles',
    description:
      'Retrieves a paginated list of church profiles with optional filters for role, branch, and search.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async findAll(@Query() query: ListProfilesDto, @Request() req: AuthenticatedRequest) {
    const churchId = req.profile?.church_id || '';
    const result = await this.profileService.listProfiles(churchId, query);
    return {
      data: result.data,
      meta: {
        total: result.total,
        page: query.page || 1,
        limit: query.limit || 20,
        totalPages: Math.ceil(result.total / (query.limit || 20)),
      },
    };
  }

  /**
   * Get a single profile by ID (same-church access).
   */
  @Get(':profileId')
  @ApiGetEndpoint(
    'Get profile by ID',
    'Retrieves a single profile by UUID. Must be in the same church.',
  )
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async findOne(
    @Param('profileId') profileId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<ProfileResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.profileService.getProfileById(profileId, churchId);
  }

  /**
   * Update a user's role (admin only).
   */
  @Patch(':profileId/role')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @HttpCode(HttpStatus.OK)
  @ApiUpdateEndpoint(
    'Update user role',
    'Changes the role of a user. Only accessible by church_admin users.',
  )
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async updateRole(
    @Param('profileId') profileId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<ProfileResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.profileService.updateProfileRole(profileId, dto, churchId, user.sub);
  }

  /**
   * Soft-delete a profile (admin only).
   */
  @Delete(':profileId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @HttpCode(HttpStatus.OK)
  @ApiDeleteEndpoint(
    'Deactivate profile',
    'Soft-deletes a profile. Only accessible by church_admin users.',
  )
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async remove(
    @Param('profileId') profileId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const churchId = req.profile?.church_id || '';
    await this.profileService.softDeleteProfile(profileId, churchId, user.sub);
    return { success: true };
  }
}
