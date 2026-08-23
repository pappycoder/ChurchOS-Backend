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
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { MediaService, MulterFile } from '../media/media.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PermissionsService } from '../auth/services/permissions.service';
import {
  PermissionDetailDto,
  ProfileResponseDto,
  ProfileRoleDto,
} from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolesDto } from './dto/update-roles.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { ListProfilesDto } from './dto/list-profiles.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { MfaSecretResponseDto } from './dto/mfa-secret-response.dto';
import { generateSecret, generateURI, verify } from 'otplib';
import { Prisma } from '@prisma/client';
import { RedisService } from '../redis/redis.service';

/**
 * Rank of each role for privilege-escalation checks. A user may only assign
 * roles at or below their own rank, and only a super_admin may assign
 * super_admin.
 */
const ROLE_RANK: Record<string, number> = {
  super_admin: 100,
  senior_pastor: 80,
  church_admin: 60,
  branch_pastor: 50,
  secretary: 40,
  treasurer: 40,
  department_head: 40,
  member: 10,
};

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
    private readonly config: ConfigService,
    private readonly audit: AuditLoggingService,
    private readonly mediaService: MediaService,
    private readonly supabase: SupabaseService,
    private readonly redis: RedisService,
    private readonly permissionsService: PermissionsService,
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

    // Safety net: hydrate a missing email from Supabase Auth once, then persist
    // it so subsequent reads (and list endpoints) see it without extra calls.
    if (!profile.email) {
      try {
        const { data } = await this.supabase.client.auth.admin.getUserById(profile.user_id);
        const authEmail = data?.user?.email;
        if (authEmail) {
          await this.prisma.profile.update({
            where: { id: profile.id },
            data: { email: authEmail },
          });
          profile.email = authEmail;
        }
      } catch (err) {
        this.logger.warn(
          `Failed to hydrate email for user ${profile.user_id}: ${(err as Error).message}`,
        );
      }
    }

    // Resolve the flat permission union across all held roles so clients can
    // gate UI affordances without extra calls. Soft-fails to an empty set —
    // server-side guards remain the real enforcement layer.
    let permissions: string[] = [];
    try {
      permissions = await this.permissionsService.getUserPermissions(
        profile.church_id,
        profile.role ?? [],
      );
    } catch (err) {
      this.logger.warn(
        `Failed to resolve permissions for user ${profile.user_id}: ${(err as Error).message}`,
      );
    }

    return this.mapToResponseDto(profile, { permissions });
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
    // TODO: Ensure the Supabase Storage bucket exists (and policies allow
    // church-scoped writes) before this upload works in production.
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

    // Apply role filter (matches profiles holding the role among their roles)
    if (query.role) {
      where.role = { has: query.role };
    }

    // Apply branch filter
    if (query.branchId) {
      where.branch_id = query.branchId;
    }

    // Apply status filter
    if (query.status) {
      where.status = query.status;
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
        member: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
            photo_url: true,
            date_of_birth: true,
            gender: true,
            address: true,
            status: true,
          },
        },
      },
    });

    if (!profile || profile.church_id !== churchId) {
      throw new NotFoundException('Profile not found');
    }

    // All roles held by the user, ordered by rank descending
    const roleNames = profile.role ?? [];

    const [roleRecords, effectivePermissions, lastSignInAt] = await Promise.all([
      this.prisma.role.findMany({
        where: {
          name: { in: roleNames },
          OR: [{ church_id: churchId }, { church_id: null }],
        },
        select: {
          name: true,
          label: true,
          church_id: true,
          description: true,
        },
      }),
      this.buildEffectivePermissions(churchId, roleNames),
      this.getLastSignIn(profile.user_id),
    ]);

    // Prefer the church-owned record's label when a name is shadowed.
    const roleLabelFor = (name: string): string | undefined => {
      const matches = roleRecords.filter((r) => r.name === name);
      return matches.find((r) => r.church_id !== null)?.label ?? matches[0]?.label ?? undefined;
    };

    const roles: ProfileRoleDto[] = roleNames.map((name) => ({
      name,
      label: roleLabelFor(name),
      description:
        roleRecords.find((r: { name: string }) => r.name === name)?.description ?? undefined,
    }));

    return this.mapToResponseDto(profile, { roles, effectivePermissions, lastSignInAt });
  }

  /**
   * Builds the union of permissions granted across all of a user's roles,
   * tracking which role(s) grant each permission.
   *
   * @param churchId - Church ID for church-specific overrides
   * @param roleNames - All role names held by the user
   * @returns Permission details sorted by resource then action
   */
  private async buildEffectivePermissions(
    churchId: string,
    roleNames: string[],
  ): Promise<PermissionDetailDto[]> {
    const details = new Map<string, PermissionDetailDto>();

    const results = await Promise.all(
      roleNames.map(async (roleName) => {
        try {
          return {
            roleName,
            role: await this.permissionsService.getRolePermissions(churchId, roleName),
          };
        } catch {
          return { roleName, role: null };
        }
      }),
    );

    for (const { roleName, role } of results) {
      if (!role) continue;
      for (const p of role.permissions) {
        const existing = details.get(p.name);
        if (existing) {
          if (!existing.grantedBy.includes(roleName)) {
            existing.grantedBy.push(roleName);
          }
        } else {
          details.set(p.name, {
            name: p.name,
            resource: p.resource,
            action: p.action,
            grantedBy: [roleName],
          });
        }
      }
    }

    // super_admin is locked to ALL permissions
    if (roleNames.includes('super_admin')) {
      const all = await this.permissionsService.getAllPermissions();
      for (const p of all) {
        const existing = details.get(p.name);
        if (existing) {
          if (!existing.grantedBy.includes('super_admin')) {
            existing.grantedBy.push('super_admin');
          }
        } else {
          details.set(p.name, {
            name: p.name,
            resource: p.resource,
            action: p.action,
            grantedBy: ['super_admin'],
          });
        }
      }
    }

    return Array.from(details.values()).sort((a, b) =>
      a.resource === b.resource
        ? a.action.localeCompare(b.action)
        : a.resource.localeCompare(b.resource),
    );
  }

  /**
   * Fetches the user's last sign-in timestamp from Supabase Auth.
   * Returns undefined on any failure — non-critical display data.
   */
  private async getLastSignIn(userId: string): Promise<string | undefined> {
    try {
      const { data, error } = await this.supabase.client.auth.admin.getUserById(userId);
      if (error || !data?.user?.last_sign_in_at) {
        return undefined;
      }
      return data.user.last_sign_in_at;
    } catch {
      return undefined;
    }
  }

  /**
   * Updates a user's single primary role (admin only).
   * Delegates to {@link updateProfileRoles} with a single-element set.
   *
   * @param profileId - Profile UUID to update
   * @param dto - Role update data
   * @param churchId - Church ID for multi-tenant scoping
   * @param adminUserId - Admin user ID for audit logging
   * @param adminRole - The acting admin's own role, used to prevent escalation
   * @returns Updated profile
   */
  async updateProfileRole(
    profileId: string,
    dto: UpdateRoleDto,
    churchId: string,
    adminUserId: string,
    adminRole: string,
  ): Promise<ProfileResponseDto> {
    return this.updateProfileRoles(
      profileId,
      { roles: [dto.role] },
      churchId,
      adminUserId,
      adminRole,
    );
  }

  /**
   * Replaces the full set of roles on a user's profile (admin only).
   *
   * The synced primary role column (`profiles.role`) is updated to the
   * highest-ranked role in the new set so legacy single-role reads stay
   * correct. Permissions are accumulated across all assigned roles.
   *
   * @param profileId - Profile UUID to update
   * @param dto - Full replacement set of roles
   * @param churchId - Church ID for multi-tenant scoping
   * @param adminUserId - Admin user ID for audit logging
   * @param adminRole - The acting admin's own role, used to prevent escalation
   * @returns Updated profile
   * @throws NotFoundException if profile doesn't exist
   * @throws ForbiddenException on privilege-escalation attempts or self role-change
   * @throws BadRequestException if any role name is unknown
   */
  async updateProfileRoles(
    profileId: string,
    dto: UpdateRolesDto,
    churchId: string,
    adminUserId: string,
    adminRole: string,
  ): Promise<ProfileResponseDto> {
    const existing = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Profile not found');
    }

    const requestedRoles = Array.from(new Set(dto.roles));

    // Validate every requested role exists and is visible to this church
    // (a global template or one owned by this church — never another church's)
    const validRoles = await this.prisma.role.findMany({
      where: {
        name: { in: requestedRoles },
        OR: [{ church_id: churchId }, { church_id: null }],
      },
      select: { name: true },
    });
    if (validRoles.length !== requestedRoles.length) {
      const known = new Set(validRoles.map((r: { name: string }) => r.name));
      const unknown = requestedRoles.filter((r) => !known.has(r));
      throw new BadRequestException(`Unknown role(s): ${unknown.join(', ')}`);
    }

    const currentRoles = existing.role ?? [];

    // Prevent modifying super_admin users unless the caller is a super_admin
    if (currentRoles.includes('super_admin') && adminRole !== 'super_admin') {
      throw new ForbiddenException('Only a super_admin can modify a super_admin user');
    }

    // Only a super_admin can assign the super_admin role
    if (requestedRoles.includes('super_admin') && adminRole !== 'super_admin') {
      throw new ForbiddenException('Only a super_admin can assign the super_admin role');
    }

    // Privilege-escalation guard: an admin cannot grant a role above their own
    const callerRank = ROLE_RANK[adminRole] ?? 0;
    for (const role of requestedRoles) {
      if ((ROLE_RANK[role] ?? 0) > callerRank) {
        throw new ForbiddenException('Cannot assign a role higher than your own');
      }
    }

    // Prevent admins from changing their own roles (no-op updates are allowed)
    const unchanged =
      requestedRoles.length === currentRoles.length &&
      requestedRoles.every((r) => currentRoles.includes(r));
    if (existing.user_id === adminUserId && !unchanged) {
      throw new ForbiddenException('Cannot change your own roles');
    }

    // Store ordered by rank descending so role[0] is the primary role
    const orderedRoles = [...requestedRoles].sort(
      (a, b) => (ROLE_RANK[b] ?? 0) - (ROLE_RANK[a] ?? 0),
    );

    await this.prisma.profile.update({
      where: { id: profileId },
      data: { role: orderedRoles },
    });

    await this.audit.log({
      userId: adminUserId,
      churchId,
      entity: 'profile',
      action: 'UPDATE',
      entityId: profileId,
      oldValues: { roles: currentRoles },
      newValues: { roles: orderedRoles },
    });

    this.logger.log(
      `Profile roles updated: ${profileId} → [${orderedRoles.join(', ')}] by ${adminUserId}`,
    );

    return this.getProfileById(profileId, churchId);
  }

  /**
   * Admin update of another user's basic details.
   *
   * Supports partial updates of names, email, phone, branch assignment,
   * and account status. Email changes are synced to Supabase Auth.
   *
   * @param profileId - Profile UUID to update
   * @param dto - Fields to update (partial)
   * @param churchId - Church ID for multi-tenant scoping
   * @param adminUserId - Admin user ID for audit logging
   * @param adminRole - The acting admin's own role, used for guard rails
   * @returns Updated profile
   * @throws NotFoundException if profile doesn't exist
   * @throws ForbiddenException on guard-rail violations
   * @throws BadRequestException if the branch is invalid or auth sync fails
   */
  async adminUpdateProfile(
    profileId: string,
    dto: AdminUpdateUserDto,
    churchId: string,
    adminUserId: string,
    adminRole: string,
  ): Promise<ProfileResponseDto> {
    const existing = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Profile not found');
    }

    const currentRoles = existing.role ?? [];

    // Only super_admins can edit super_admin users
    if (currentRoles.includes('super_admin') && adminRole !== 'super_admin') {
      throw new ForbiddenException('Only a super_admin can edit a super_admin user');
    }

    // Prevent self-deactivation via inline edit
    if (existing.user_id === adminUserId && dto.status === 'inactive') {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    // Validate branch belongs to the same church
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, church_id: churchId },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException('Branch not found in this church');
      }
    }

    // Sync email changes to Supabase Auth so credentials stay consistent
    if (dto.email !== undefined && dto.email !== existing.email) {
      const { error } = await this.supabase.client.auth.admin.updateUserById(existing.user_id, {
        email: dto.email,
      });
      if (error) {
        throw new BadRequestException(`Failed to update auth email: ${error.message}`);
      }
    }

    const data: Prisma.ProfileUncheckedUpdateInput = {};
    if (dto.firstName !== undefined) data.first_name = dto.firstName;
    if (dto.lastName !== undefined) data.last_name = dto.lastName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.branchId !== undefined) data.branch_id = dto.branchId || null;
    if (dto.status !== undefined) data.status = dto.status;

    await this.prisma.profile.update({
      where: { id: profileId },
      data,
    });

    await this.audit.log({
      userId: adminUserId,
      churchId,
      entity: 'profile',
      action: 'UPDATE',
      entityId: profileId,
      oldValues: {
        firstName: existing.first_name,
        lastName: existing.last_name,
        email: existing.email,
        phone: existing.phone,
        branchId: existing.branch_id,
        status: existing.status,
      },
      newValues: {
        firstName: dto.firstName ?? existing.first_name,
        lastName: dto.lastName ?? existing.last_name,
        email: dto.email ?? existing.email,
        phone: dto.phone ?? existing.phone,
        branchId: dto.branchId !== undefined ? dto.branchId || null : existing.branch_id,
        status: dto.status ?? existing.status,
      },
    });

    this.logger.log(`Profile updated by admin: ${profileId} by ${adminUserId}`);

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

    // Persist the soft-delete by marking the profile inactive
    await this.prisma.profile.update({
      where: { id: profileId },
      data: { status: 'inactive' },
    });

    await this.audit.log({
      userId: adminUserId,
      churchId,
      entity: 'profile',
      action: 'DELETE',
      entityId: profileId,
      oldValues: { role: existing.role, status: existing.status },
      newValues: { status: 'inactive' },
    });

    this.logger.log(`Profile deactivated: ${profileId} by ${adminUserId}`);
  }

  /**
   * Reactivates a deactivated profile by setting status back to active.
   *
   * @param profileId - Profile UUID to reactivate
   * @param churchId - Church ID for multi-tenant scoping
   * @param adminUserId - Admin user ID for audit logging
   * @returns Updated profile response
   * @throws NotFoundException if profile doesn't exist
   */
  async reactivateProfile(
    profileId: string,
    churchId: string,
    adminUserId: string,
  ): Promise<ProfileResponseDto> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, church_id: churchId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (profile.status === 'active') {
      return this.getProfileById(profileId, churchId);
    }

    await this.prisma.profile.update({
      where: { id: profileId },
      data: { status: 'active' },
    });

    await this.audit.log({
      userId: adminUserId,
      churchId,
      entity: 'profile',
      action: 'UPDATE',
      entityId: profileId,
      oldValues: { status: 'inactive' },
      newValues: { status: 'active' },
    });

    this.logger.log(`Profile reactivated: ${profileId} by ${adminUserId}`);

    return this.getProfileById(profileId, churchId);
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

    await this.redis.set(this.getMfaSecretKey(userId), secret, 600);

    await this.audit.log({
      userId,
      churchId: profile.church_id,
      entity: 'profile',
      action: 'CREATE',
      entityId: profile.id,
      newValues: { mfa_setup_started: true },
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

    const secret = await this.redis.get<string>(this.getMfaSecretKey(userId));

    if (!secret) {
      throw new BadRequestException('No MFA secret found. Run /mfa/generate first.');
    }

    const isValid = verify({ token: code, secret });

    if (!isValid) {
      throw new BadRequestException('Invalid MFA code');
    }

    await this.prisma.profile.update({
      where: { user_id: userId },
      data: { mfa_enabled: true },
    });

    await this.redis.del(this.getMfaSecretKey(userId));

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

    const secret = await this.redis.get<string>(this.getMfaSecretKey(userId));

    if (!secret) {
      throw new BadRequestException('MFA secret not found. Re-enable MFA.');
    }

    const isValid = verify({ token: code, secret });

    if (!isValid) {
      throw new BadRequestException('Invalid MFA code');
    }

    await this.prisma.profile.update({
      where: { user_id: userId },
      data: { mfa_enabled: false },
    });

    await this.redis.del(this.getMfaSecretKey(userId));

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
   * Invite a new user via email.
   * Creates a Supabase Auth user via admin invite API, then creates the Profile.
   */
  async inviteUser(
    dto: InviteUserDto,
    churchId: string,
    invitedByUserId: string,
  ): Promise<ProfileResponseDto> {
    if (!dto.email?.trim()) {
      throw new BadRequestException('Email is required');
    }

    if (!dto.firstName?.trim() || !dto.lastName?.trim()) {
      throw new BadRequestException('First name and last name are required');
    }

    const supabase = this.supabase.client;

    const normalizedEmail = dto.email.trim().toLowerCase();
    const orConditions: Prisma.ProfileWhereInput[] = [{ email: normalizedEmail }];
    if (dto.phone) {
      orConditions.push({ phone: dto.phone });
    }

    const existing = await this.prisma.profile.findFirst({
      where: {
        church_id: churchId,
        OR: orConditions,
      },
    });

    if (existing) {
      const field = existing.email === normalizedEmail ? 'email' : 'phone';
      throw new ConflictException(`A user with this ${field} already exists in this church`);
    }

    // TODO: Send the invitation via Resend (branded email with church name,
    // inviter details, and setup instructions) instead of Supabase's default
    // invite template.
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(dto.email, {
      data: {
        first_name: dto.firstName,
        last_name: dto.lastName,
        church_id: churchId,
        role: dto.role,
      },
      redirectTo: `${this.config.get<string>('WEB_URL')}/auth/callback`,
    });

    if (error) {
      this.logger.error(`Supabase invite failed: ${error.message}`);
      throw new BadRequestException(`Failed to send invitation: ${error.message}`);
    }

    if (!data?.user) {
      throw new BadRequestException('Failed to create user');
    }

    let profile;
    try {
      profile = await this.prisma.profile.create({
        data: {
          user_id: data.user.id,
          church_id: churchId,
          branch_id: dto.branchId || null,
          role: [dto.role],
          first_name: dto.firstName,
          last_name: dto.lastName,
          phone: dto.phone || null,
          email: normalizedEmail,
        },
      });
    } catch (err) {
      // Roll back the created Supabase Auth user so we don't leak an orphaned
      // account that has no local profile.
      this.logger.error(
        `Profile creation failed for invited user, deleting Supabase user ${data.user.id}: ${(err as Error).message}`,
      );
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
      throw new BadRequestException('Failed to create user profile');
    }

    await this.audit.log({
      userId: invitedByUserId,
      churchId,
      entity: 'user',
      action: 'CREATE',
      entityId: profile.id,
      newValues: { email: dto.email, role: dto.role },
    });

    this.logger.log(`User invited: ${dto.email} as ${dto.role} for church ${churchId}`);

    return this.mapToResponseDto({
      ...profile,
      church: null,
      branch: null,
    });
  }

  /**
   * Deactivate a user (disable their Supabase Auth account).
   */
  async deactivateUser(
    profileId: string,
    churchId: string,
    userId: string,
  ): Promise<{ deactivated: boolean }> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, church_id: churchId },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    if (profile.role.includes('super_admin')) {
      throw new BadRequestException('Cannot deactivate a super_admin user');
    }

    const supabase = this.supabase.client;

    // Mark the profile inactive so the auth layer rejects future requests
    await this.prisma.profile.update({
      where: { id: profileId },
      data: { status: 'inactive' },
    });

    // Invalidate the user's active sessions so deactivation takes effect immediately
    const { error } = await supabase.auth.admin.signOut(profile.user_id);
    if (error) {
      this.logger.warn(`Supabase sign-out warning: ${error.message}`);
    }

    await this.audit.log({
      userId,
      churchId,
      entity: 'user',
      action: 'DELETE',
      entityId: profileId,
      oldValues: { role: profile.role, status: profile.status },
      newValues: { deactivated: true, status: 'inactive' },
    });

    this.logger.log(`User deactivated: ${profileId} for church ${churchId}`);

    return { deactivated: true };
  }

  /**
   * Reset a user's password via Supabase Auth admin API.
   */
  async resetUserPassword(
    profileId: string,
    churchId: string,
    userId: string,
  ): Promise<{ resetSent: boolean }> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, church_id: churchId },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    const supabase = this.supabase.client;

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      profile.user_id,
    );

    if (userError || !userData?.user?.email) {
      this.logger.error(`Could not look up user email for password reset: ${userError?.message}`);
      throw new BadRequestException('Could not find user email for password reset');
    }

    // Actually deliver the reset email. generateLink() only builds a link and
    // never sends it; resetPasswordForEmail() emails the user a reset link.
    const { error } = await supabase.auth.resetPasswordForEmail(userData.user.email, {
      redirectTo: `${this.config.get<string>('WEB_URL')}/auth/reset-password`,
    });

    if (error) {
      this.logger.error(`Password reset failed: ${error.message}`);
      throw new BadRequestException('Failed to generate password reset link');
    }

    await this.audit.log({
      userId,
      churchId,
      entity: 'user',
      action: 'UPDATE',
      entityId: profileId,
      newValues: { action: 'password_reset' },
    });

    this.logger.log(`Password reset link generated for user ${profileId}`);

    return { resetSent: true };
  }

  /**
   * Force sign-out a user by invalidating their refresh tokens.
   */
  async forceSignOut(
    profileId: string,
    churchId: string,
    userId: string,
  ): Promise<{ signedOut: boolean }> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, church_id: churchId },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    const supabase = this.supabase.client;
    const { error } = await supabase.auth.admin.signOut(profile.user_id);

    if (error) {
      this.logger.warn(`Force sign-out warning: ${error.message}`);
    }

    await this.audit.log({
      userId,
      churchId,
      entity: 'user',
      action: 'UPDATE',
      entityId: profileId,
      newValues: { action: 'force_signout' },
    });

    return { signedOut: true };
  }

  private getMfaSecretKey(userId: string): string {
    return `mfa:${userId}`;
  }

  /**
   * Maps a Prisma Profile model to the response DTO.
   *
   * @param profile - Prisma profile with included relations
   * @param extras - Optional enrichment data (roles, permissions, member, last sign-in)
   * @returns ProfileResponseDto
   */
  private mapToResponseDto(
    profile: {
      id: string;
      user_id: string;
      church_id: string;
      branch_id: string | null;
      role: string[];
      status: string;
      first_name: string;
      last_name: string;
      email?: string | null;
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
      member?: {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        photo_url: string | null;
        date_of_birth: Date | null;
        gender: string | null;
        address: string | null;
        status: string;
      } | null;
    },
    extras?: {
      roles?: ProfileRoleDto[];
      effectivePermissions?: PermissionDetailDto[];
      lastSignInAt?: string;
      permissions?: string[];
    },
  ): ProfileResponseDto {
    return {
      profileId: profile.id,
      userId: profile.user_id,
      churchId: profile.church_id,
      branchId: profile.branch_id || undefined,
      role: profile.role ?? [],
      firstName: profile.first_name,
      lastName: profile.last_name,
      email: profile.email || undefined,
      phone: profile.phone || undefined,
      avatarUrl: profile.avatar_url || undefined,
      mfaEnabled: profile.mfa_enabled,
      status: profile.status,
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
      roles: extras?.roles,
      effectivePermissions: extras?.effectivePermissions,
      permissions: extras?.permissions,
      lastSignInAt: extras?.lastSignInAt,
      member: profile.member
        ? {
            memberId: profile.member.id,
            firstName: profile.member.first_name,
            lastName: profile.member.last_name,
            email: profile.member.email || undefined,
            phone: profile.member.phone || undefined,
            photoUrl: profile.member.photo_url || undefined,
            dateOfBirth: profile.member.date_of_birth?.toISOString(),
            gender: profile.member.gender || undefined,
            address: profile.member.address || undefined,
            status: profile.member.status,
          }
        : undefined,
    };
  }
}
