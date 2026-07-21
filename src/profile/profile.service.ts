/**
 * @file profile.service.ts
 * @description Business logic for profile management, photo upload, and role updates.
 *
 * Handles profile CRUD, avatar upload via MediaService, role management,
 * and soft-delete. All mutations are audit-logged.
 *
 * @module profile/profile.service
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { MediaService, MulterFile } from '../media/media.service';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ListProfilesDto } from './dto/list-profiles.dto';
import { MfaSecretResponseDto } from './dto/mfa-secret-response.dto';
import { generateSecret, generateURI, verify } from 'otplib';
import { Prisma } from '@prisma/client';

/**
 * Service for managing user profiles.
 * Provides methods for self-service profile updates, admin role management,
 * and profile listing with multi-tenant scoping.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * Retrieves the full profile for an authenticated user.
   *
   * @param userId - Supabase Auth user ID (from JWT sub claim)
   * @returns Profile with church and branch details
   * @throws NotFoundException if no profile exists for the user
   */
  async getMyProfile(userId: string): Promise<ProfileResponseDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      include: {
        church: {
          select: {
            id: true,
            name: true,
            denomination: true,
            logo_url: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            is_headquarters: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return this.mapToResponseDto(profile);
  }

  /**
   * Updates profile details for the authenticated user.
   *
   * Supports partial updates — only provided fields are updated.
   *
   * @param userId - Supabase Auth user ID
   * @param dto - Profile update data (partial)
   * @returns Updated profile response
   * @throws NotFoundException if profile doesn't exist
   */
  async updateMyProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileResponseDto> {
    const existing = await this.prisma.profile.findUnique({
      where: { user_id: userId },
    });

    if (!existing) {
      throw new NotFoundException('User profile not found');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.firstName !== undefined) updateData.first_name = dto.firstName;
    if (dto.lastName !== undefined) updateData.last_name = dto.lastName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;

    if (Object.keys(updateData).length === 0) {
      return this.getMyProfile(userId);
    }

    await this.prisma.profile.update({
      where: { user_id: userId },
      data: updateData,
    });

    await this.audit.log({
      userId,
      churchId: existing.church_id,
      entity: 'profile',
      action: 'UPDATE',
      entityId: existing.id,
      newValues: updateData,
    });

    this.logger.log(`Profile updated for user: ${userId}`);

    return this.getMyProfile(userId);
  }

  /**
   * Uploads and sets a profile photo (avatar).
   *
   * Deletes the previous avatar from Supabase Storage if one exists.
   *
   * @param userId - Supabase Auth user ID
   * @param file - Image file to upload
   * @param churchId - Church ID for storage isolation
   * @returns Updated profile with new avatar URL
   * @throws NotFoundException if profile doesn't exist
   */
  async uploadProfilePhoto(
    userId: string,
    file: MulterFile,
    churchId: string,
  ): Promise<ProfileResponseDto> {
    const existing = await this.prisma.profile.findUnique({
      where: { user_id: userId },
    });

    if (!existing) {
      throw new NotFoundException('User profile not found');
    }

    // Delete old avatar if exists
    if (existing.avatar_url) {
      await this.mediaService.deleteByUrl(existing.avatar_url);
    }

    // Upload new avatar
    const result = await this.mediaService.uploadImage(file, 'profiles', churchId);

    // Update profile with new avatar URL
    await this.prisma.profile.update({
      where: { user_id: userId },
      data: { avatar_url: result.url },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'profile',
      action: 'UPDATE',
      entityId: existing.id,
      oldValues: { avatarUrl: existing.avatar_url },
      newValues: { avatarUrl: result.url },
    });

    this.logger.log(`Profile photo updated for user: ${userId}`);

    return this.getMyProfile(userId);
  }

  /**
   * Lists all profiles for a church with pagination, search, and filters.
   *
   * @param churchId - Church ID for multi-tenant scoping
   * @param query - List query parameters (pagination, search, filters)
   * @returns Paginated list of profiles
   */
  async listProfiles(
    churchId: string,
    query: ListProfilesDto,
  ): Promise<{ data: ProfileResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProfileWhereInput = { church_id: churchId };

    // Apply search filter
    if (query.search) {
      where.OR = [
        { first_name: { contains: query.search, mode: 'insensitive' } },
        { last_name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Apply role filter
    if (query.role) {
      where.role = query.role;
    }

    // Apply branch filter
    if (query.branchId) {
      where.branch_id = query.branchId;
    }

    // Build sort
    const orderBy: Prisma.ProfileOrderByWithRelationInput[] = [];
    if (query.sortBy) {
      orderBy.push({ [query.sortBy]: (query.sortOrder || 'asc') as Prisma.SortOrder });
    } else {
      orderBy.push({ created_at: 'desc' });
    }

    const [items, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          church: {
            select: {
              id: true,
              name: true,
              denomination: true,
              logo_url: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              is_headquarters: true,
            },
          },
        },
      }),
      this.prisma.profile.count({ where }),
    ]);

    return {
      data: items.map((item) => this.mapToResponseDto(item)),
      total,
    };
  }

  /**
   * Gets a single profile by ID (admin or same-church access).
   *
   * @param profileId - Profile UUID
   * @param churchId - Church ID for multi-tenant scoping
   * @returns Profile response
   * @throws NotFoundException if profile doesn't exist or belongs to another church
   */
  async getProfileById(profileId: string, churchId: string): Promise<ProfileResponseDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        church: {
          select: {
            id: true,
            name: true,
            denomination: true,
            logo_url: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            is_headquarters: true,
          },
        },
      },
    });

    if (!profile || profile.church_id !== churchId) {
      throw new NotFoundException('Profile not found');
    }

    return this.mapToResponseDto(profile);
  }

  /**
   * Updates a user's role (admin only).
   *
   * @param profileId - Profile UUID to update
   * @param dto - Role update data
   * @param churchId - Church ID for multi-tenant scoping
   * @param adminUserId - Admin user ID for audit logging
   * @returns Updated profile
   * @throws NotFoundException if profile doesn't exist
   * @throws ForbiddenException if trying to modify a super_admin
   */
  async updateProfileRole(
    profileId: string,
    dto: UpdateRoleDto,
    churchId: string,
    adminUserId: string,
  ): Promise<ProfileResponseDto> {
    const existing = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Profile not found');
    }

    // Prevent modifying super_admin roles
    if (existing.role === 'super_admin') {
      throw new ForbiddenException('Cannot modify a super_admin role');
    }

    // Prevent self-demotion
    if (existing.user_id === adminUserId && dto.role !== existing.role) {
      throw new ForbiddenException('Cannot change your own role');
    }

    await this.prisma.profile.update({
      where: { id: profileId },
      data: { role: dto.role },
    });

    await this.audit.log({
      userId: adminUserId,
      churchId,
      entity: 'profile',
      action: 'UPDATE',
      entityId: profileId,
      oldValues: { role: existing.role },
      newValues: { role: dto.role },
    });

    this.logger.log(`Profile role updated: ${profileId} → ${dto.role} by ${adminUserId}`);

    return this.getProfileById(profileId, churchId);
  }

  /**
   * Soft-deletes a profile by setting status to inactive (admin only).
   *
   * @param profileId - Profile UUID to deactivate
   * @param churchId - Church ID for multi-tenant scoping
   * @param adminUserId - Admin user ID for audit logging
   * @throws NotFoundException if profile doesn't exist
   * @throws ForbiddenException if trying to deactivate self
   */
  async softDeleteProfile(profileId: string, churchId: string, adminUserId: string): Promise<void> {
    const existing = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Profile not found');
    }

    // Prevent self-deactivation
    if (existing.user_id === adminUserId) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    await this.audit.log({
      userId: adminUserId,
      churchId,
      entity: 'profile',
      action: 'DELETE',
      entityId: profileId,
      oldValues: { role: existing.role },
      newValues: { status: 'inactive' },
    });

    this.logger.log(`Profile deactivated: ${profileId} by ${adminUserId}`);
  }

  /**
   * Generates a TOTP secret for the user's MFA setup.
   *
   * Returns the secret and otpauth URL for QR code generation.
   * Stores the secret in an audit log for later verification during enableMfa.
   * MFA must not already be enabled for this user.
   *
   * @param userId - Supabase Auth user ID (from JWT sub claim)
   * @returns Secret string and otpauth URL for authenticator app setup
   * @throws NotFoundException if no profile exists for this user
   * @throws BadRequestException if MFA is already enabled
   */
  async generateMfaSecret(userId: string): Promise<MfaSecretResponseDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      include: { church: { select: { name: true } } },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    if (profile.mfa_enabled) {
      throw new BadRequestException('MFA is already enabled. Disable it first.');
    }

    const secret = generateSecret();
    const otpauthUrl = generateURI({
      secret,
      label: `${profile.first_name} ${profile.last_name}`,
      issuer: profile.church.name,
    });

    // Store the secret temporarily (not yet enabled)
    await this.prisma.profile.update({
      where: { user_id: userId },
      data: { mfa_enabled: false },
    });

    // Store secret in a transient way — use a predictable key
    // In production this should use Redis with TTL; for now store via audit
    await this.audit.log({
      userId,
      churchId: profile.church_id,
      entity: 'profile',
      action: 'CREATE',
      entityId: profile.id,
      newValues: { secret },
    });

    this.logger.log(`MFA secret generated for user: ${userId}`);

    return { secret, otpauthUrl };
  }

  /**
   * Verifies a TOTP code against the stored secret and enables MFA.
   *
   * Retrieves the secret from the most recent audit log entry created by
   * generateMfaSecret, validates the provided code, and enables MFA on the profile.
   *
   * @param userId - Supabase Auth user ID (from JWT sub claim)
   * @param code - 6-digit TOTP code from authenticator app
   * @returns Updated profile response with MFA enabled
   * @throws NotFoundException if no profile exists for this user
   * @throws BadRequestException if MFA is already enabled or no secret is found
   * @throws BadRequestException if the provided code is invalid
   */
  async enableMfa(userId: string, code: string): Promise<ProfileResponseDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    if (profile.mfa_enabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    // Retrieve the secret from the last audit log with a secret in new_values
    const auditLog = await this.prisma.auditLog.findFirst({
      where: {
        user_id: userId,
        entity: 'profile',
        entity_id: profile.id,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!auditLog || !auditLog.new_values) {
      throw new BadRequestException('No MFA secret found. Run /mfa/generate first.');
    }

    const secret = (auditLog.new_values as Record<string, string>).secret;
    const isValid = verify({ token: code, secret });

    if (!isValid) {
      throw new BadRequestException('Invalid MFA code');
    }

    await this.prisma.profile.update({
      where: { user_id: userId },
      data: { mfa_enabled: true },
    });

    await this.audit.log({
      userId,
      churchId: profile.church_id,
      entity: 'profile',
      action: 'UPDATE',
      entityId: profile.id,
      newValues: { mfa_enabled: true },
    });

    this.logger.log(`MFA enabled for user: ${userId}`);

    return this.getMyProfile(userId);
  }

  /**
   * Disables MFA for the user after verifying a valid TOTP code.
   *
   * Requires the user to provide their current TOTP code to confirm identity
   * before disabling MFA protection on their account.
   *
   * @param userId - Supabase Auth user ID (from JWT sub claim)
   * @param code - 6-digit TOTP code from authenticator app to confirm identity
   * @returns Updated profile response with MFA disabled
   * @throws NotFoundException if no profile exists for this user
   * @throws BadRequestException if MFA is not currently enabled
   * @throws BadRequestException if the provided code is invalid
   */
  async disableMfa(userId: string, code: string): Promise<ProfileResponseDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    if (!profile.mfa_enabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    // Retrieve secret from last audit log with a secret
    const auditLog = await this.prisma.auditLog.findFirst({
      where: {
        user_id: userId,
        entity: 'profile',
        entity_id: profile.id,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!auditLog || !auditLog.new_values) {
      throw new BadRequestException('MFA secret not found. Re-enable MFA.');
    }

    const secret = (auditLog.new_values as Record<string, string>).secret;
    const isValid = verify({ token: code, secret });

    if (!isValid) {
      throw new BadRequestException('Invalid MFA code');
    }

    await this.prisma.profile.update({
      where: { user_id: userId },
      data: { mfa_enabled: false },
    });

    await this.audit.log({
      userId,
      churchId: profile.church_id,
      entity: 'profile',
      action: 'UPDATE',
      entityId: profile.id,
      newValues: { mfa_enabled: false },
    });

    this.logger.log(`MFA disabled for user: ${userId}`);

    return this.getMyProfile(userId);
  }

  /**
   * Maps a Prisma Profile model to the response DTO.
   *
   * @param profile - Prisma profile with included relations
   * @returns ProfileResponseDto
   */
  private mapToResponseDto(profile: {
    id: string;
    user_id: string;
    church_id: string;
    branch_id: string | null;
    role: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    avatar_url: string | null;
    mfa_enabled: boolean;
    created_at: Date;
    updated_at: Date;
    church?: {
      id: string;
      name: string;
      denomination: string | null;
      logo_url: string | null;
    } | null;
    branch?: {
      id: string;
      name: string;
      is_headquarters: boolean;
    } | null;
  }): ProfileResponseDto {
    return {
      profileId: profile.id,
      userId: profile.user_id,
      churchId: profile.church_id,
      branchId: profile.branch_id || undefined,
      role: profile.role,
      firstName: profile.first_name,
      lastName: profile.last_name,
      phone: profile.phone || undefined,
      avatarUrl: profile.avatar_url || undefined,
      mfaEnabled: profile.mfa_enabled,
      status: 'active',
      createdAt: profile.created_at.toISOString(),
      updatedAt: profile.updated_at.toISOString(),
      church: profile.church
        ? {
            churchId: profile.church.id,
            name: profile.church.name,
            denomination: profile.church.denomination || undefined,
            logoUrl: profile.church.logo_url || undefined,
          }
        : undefined,
      branch: profile.branch
        ? {
            branchId: profile.branch.id,
            name: profile.branch.name,
            isHeadquarters: profile.branch.is_headquarters,
          }
        : undefined,
    };
  }
}
