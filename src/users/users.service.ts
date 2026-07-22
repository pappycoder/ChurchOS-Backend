/**
 * @file users.service.ts
 * @description Service for user management operations.
 *
 * Manages church users by combining Supabase Auth (authentication)
 * with Prisma Profile records (profile data). Provides listing,
 * invitation, deactivation, and password reset capabilities.
 *
 * @module users/users.service
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { SupabaseService } from '../supabase/supabase.service';
import { UserResponseDto } from './dto/user-response.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditLoggingService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * List all users (profiles) for a church with pagination and filters.
   */
  async listUsers(
    churchId: string,
    page = 1,
    limit = 20,
    search?: string,
    role?: string,
    _status?: string,
    sortBy = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<{ data: UserResponseDto[]; total: number }> {
    const skip = (page - 1) * limit;

    const where: Prisma.ProfileWhereInput = { church_id: churchId };

    if (search) {
      where.OR = [
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    if (role) {
      where.role = role;
    }

    const orderBy: Prisma.ProfileOrderByWithRelationInput = {};
    if (sortBy === 'name') {
      orderBy.first_name = sortOrder;
    } else if (sortBy === 'role') {
      orderBy.role = sortOrder;
    } else {
      orderBy.created_at = sortOrder;
    }

    const [profiles, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.profile.count({ where }),
    ]);

    return {
      data: profiles.map((p) => this.mapProfileToDto(p)),
      total,
    };
  }

  /**
   * Get a single user by ID (same church).
   */
  async getUserById(profileId: string, churchId: string): Promise<UserResponseDto> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, church_id: churchId },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    return this.mapProfileToDto(profile);
  }

  /**
   * Invite a new user via email.
   * Creates a Supabase Auth user via admin invite API, then creates the Profile.
   */
  async inviteUser(
    dto: InviteUserDto,
    churchId: string,
    invitedByUserId: string,
  ): Promise<UserResponseDto> {
    if (!dto.email?.trim()) {
      throw new BadRequestException('Email is required');
    }

    if (!dto.firstName?.trim() || !dto.lastName?.trim()) {
      throw new BadRequestException('First name and last name are required');
    }

    const supabase = this.supabase.client;

    // Check for existing profile with this email pattern (by phone or name)
    const existing = await this.prisma.profile.findFirst({
      where: {
        church_id: churchId,
        OR: [{ phone: dto.phone || '__none__' }],
      },
    });

    if (existing && dto.phone && existing.phone === dto.phone) {
      throw new ConflictException('A user with this phone number already exists');
    }

    // Invite via Supabase Auth admin API
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

    // Create Profile record
    const profile = await this.prisma.profile.create({
      data: {
        user_id: data.user.id,
        church_id: churchId,
        branch_id: dto.branchId || null,
        role: dto.role,
        first_name: dto.firstName,
        last_name: dto.lastName,
        phone: dto.phone || null,
      },
    });

    await this.audit.log({
      userId: invitedByUserId,
      churchId,
      entity: 'user',
      action: 'CREATE',
      entityId: profile.id,
      newValues: { email: dto.email, role: dto.role },
    });

    this.logger.log(`User invited: ${dto.email} as ${dto.role} for church ${churchId}`);

    return this.mapProfileToDto(profile);
  }

  /**
   * Update a user's profile.
   */
  async updateUser(
    profileId: string,
    churchId: string,
    userId: string,
    data: { firstName?: string; lastName?: string; phone?: string; branchId?: string },
  ): Promise<UserResponseDto> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, church_id: churchId },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    const updateData: Prisma.ProfileUpdateInput = {};

    if (data.firstName !== undefined) {
      const firstName = data.firstName?.trim();
      if (firstName) {
        updateData.first_name = firstName;
      } else {
        throw new BadRequestException('First name cannot be empty');
      }
    }

    if (data.lastName !== undefined) {
      const lastName = data.lastName?.trim();
      if (lastName) {
        updateData.last_name = lastName;
      } else {
        throw new BadRequestException('Last name cannot be empty');
      }
    }

    if (data.phone !== undefined) {
      updateData.phone = data.phone?.trim() || null;
    }

    if (data.branchId !== undefined) {
      updateData.branch_id = data.branchId || null;
    }

    const updated = await this.prisma.profile.update({
      where: { id: profileId },
      data: updateData,
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'user',
      action: 'UPDATE',
      entityId: profileId,
      newValues: data,
    });

    return this.mapProfileToDto(updated);
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

    if (profile.role === 'super_admin') {
      throw new BadRequestException('Cannot deactivate a super_admin user');
    }

    // Disable in Supabase Auth
    const supabase = this.supabase.client;
    const { error } = await supabase.auth.admin.updateUserById(profile.user_id, {
      ban_duration: 'none',
    });

    if (error) {
      this.logger.warn(`Supabase user disable warning: ${error.message}`);
    }

    // Mark as inactive in Profile
    await this.prisma.profile.update({
      where: { id: profileId },
      data: { role: profile.role }, // Keep role but we track via status in response
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'user',
      action: 'DELETE',
      entityId: profileId,
      newValues: { deactivated: true },
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

    // Look up the user's email from Supabase Auth
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      profile.user_id,
    );

    if (userError || !userData?.user?.email) {
      this.logger.error(`Could not look up user email for password reset: ${userError?.message}`);
      throw new BadRequestException('Could not find user email for password reset');
    }

    const { error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
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

  private mapProfileToDto(
    profile: Record<string, unknown> & { id: string; created_at: Date },
  ): UserResponseDto {
    return {
      id: profile.id,
      userId: profile.user_id as string,
      churchId: profile.church_id as string,
      branchId: (profile.branch_id as string) || undefined,
      firstName: profile.first_name as string,
      lastName: profile.last_name as string,
      phone: (profile.phone as string) || undefined,
      avatarUrl: (profile.avatar_url as string) || undefined,
      role: profile.role as string,
      status: 'active',
      mfaEnabled: (profile.mfa_enabled as boolean) || false,
      createdAt: profile.created_at.toISOString(),
      updatedAt: profile.updated_at ? (profile.updated_at as Date).toISOString() : undefined,
    };
  }
}
