/**
 * @file Church management service with CRUD operations.
 * @module ChurchService
 * @description Handles church details, configuration, and staff management.
 * Provides multi-tenant isolation via church_id and audit logging for all mutations.
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { MediaService } from '../media/media.service';
import { UpdateChurchDto } from './dto/update-church.dto';
import { ChurchResponseDto } from './dto/church-response.dto';
import { ChurchConfigResponseDto } from './dto/church-config-response.dto';
import { UpdateChurchConfigDto } from './dto/update-church-config.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { StaffResponseDto } from './dto/staff-response.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';
import { Prisma } from '@prisma/client';

/**
 * Service for managing church details, configuration, and staff.
 * Provides CRUD operations with multi-tenant isolation and audit logging.
 */
@Injectable()
export class ChurchService {
  private readonly logger = new Logger(ChurchService.name);

  /**
   * Creates an instance of ChurchService.
   * @param prisma - Prisma database service
   * @param supabase - Supabase client for auth operations
   * @param audit - Audit logging service for tracking mutations
   * @param media - Media service for file operations
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly audit: AuditLoggingService,
    private readonly media: MediaService,
  ) {}

  /**
   * Retrieves a church by ID with branch and member counts.
   * @param churchId - The church UUID
   * @returns ChurchResponseDto with church details
   * @throws NotFoundException if church not found
   */
  async getChurch(churchId: string): Promise<ChurchResponseDto> {
    const church = await this.prisma.church.findUnique({
      where: { id: churchId },
      include: {
        _count: {
          select: { branches: true, members: true },
        },
      },
    });

    if (!church) {
      throw new NotFoundException('Church not found');
    }

    return this.mapToResponseDto(church);
  }

  /**
   * Updates church details with partial updates.
   * Deletes old logo from Supabase Storage when replaced.
   * @param churchId - The church UUID
   * @param dto - Update data (all fields optional)
   * @param userId - User performing the update (for audit log)
   * @returns Updated ChurchResponseDto
   * @throws NotFoundException if church not found
   */
  async updateChurch(
    churchId: string,
    dto: UpdateChurchDto,
    userId: string,
  ): Promise<ChurchResponseDto> {
    const existing = await this.prisma.church.findUnique({ where: { id: churchId } });

    if (!existing) {
      throw new NotFoundException('Church not found');
    }

    if (existing.logo_url && dto.logoUrl && existing.logo_url !== dto.logoUrl) {
      await this.media.deleteByUrl(existing.logo_url);
    }

    const updateData: Prisma.ChurchUpdateInput = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.denomination !== undefined) updateData.denomination = dto.denomination || null;
    if (dto.address !== undefined) updateData.address = dto.address || null;
    if (dto.city !== undefined) updateData.city = dto.city || null;
    if (dto.state !== undefined) updateData.state = dto.state || null;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.phone !== undefined) updateData.phone = dto.phone || null;
    if (dto.email !== undefined) updateData.email = dto.email || null;
    if (dto.website !== undefined) updateData.website = dto.website || null;
    if (dto.logoUrl !== undefined) updateData.logo_url = dto.logoUrl || null;

    if (Object.keys(updateData).length === 0) {
      return this.getChurch(churchId);
    }

    const church = await this.prisma.church.update({
      where: { id: churchId },
      data: updateData,
      include: {
        _count: {
          select: { branches: true, members: true },
        },
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'church',
      action: 'UPDATE',
      entityId: churchId,
      oldValues: {
        name: existing.name,
        denomination: existing.denomination,
        logo_url: existing.logo_url,
      },
      newValues: updateData as Record<string, unknown>,
    });

    this.logger.log(`Church updated: ${churchId}`);

    return this.mapToResponseDto(church);
  }

  /**
   * Retrieves all configuration key-value pairs for a church.
   * @param churchId - The church UUID
   * @returns ChurchConfigResponseDto with all config values
   */
  async getChurchConfig(churchId: string): Promise<ChurchConfigResponseDto> {
    const configs = await this.prisma.churchConfig.findMany({
      where: { church_id: churchId },
    });

    const config: Record<string, unknown> = {};
    for (const c of configs) {
      config[c.key] = c.value;
    }

    return { config };
  }

  /**
   * Upserts configuration key-value pairs for a church.
   * @param churchId - The church UUID
   * @param dto - Config key-value pairs to upsert
   * @param userId - User performing the update (for audit log)
   * @returns Updated ChurchConfigResponseDto
   */
  async updateChurchConfig(
    churchId: string,
    dto: UpdateChurchConfigDto,
    userId: string,
  ): Promise<ChurchConfigResponseDto> {
    const existing = await this.prisma.churchConfig.findMany({
      where: { church_id: churchId },
    });

    const oldConfig: Record<string, unknown> = {};
    for (const c of existing) {
      oldConfig[c.key] = c.value;
    }

    if (dto.config) {
      const entries = Object.entries(dto.config);
      for (const [key, value] of entries) {
        await this.prisma.churchConfig.upsert({
          where: {
            church_id_key: { church_id: churchId, key },
          },
          update: { value: value as Prisma.InputJsonValue },
          create: {
            church_id: churchId,
            key,
            value: value as Prisma.InputJsonValue,
          },
        });
      }
    }

    await this.audit.log({
      userId,
      churchId,
      entity: 'church_config',
      action: 'UPDATE',
      entityId: churchId,
      oldValues: oldConfig,
      newValues: dto.config as Record<string, unknown>,
    });

    this.logger.log(`Church config updated: ${churchId}`);

    return this.getChurchConfig(churchId);
  }

  /**
   * Invites a staff member via Supabase Auth invitation.
   * Creates a Profile record and sends invitation email.
   * @param churchId - The church UUID
   * @param dto - Staff invitation details (email, name, role, branch)
   * @param userId - User performing the invitation (for audit log)
   * @returns StaffResponseDto with created profile details
   * @throws ConflictException if staff with email already exists
   * @throws InternalServerErrorException if invitation fails
   */
  async inviteStaff(
    churchId: string,
    dto: InviteStaffDto,
    userId: string,
  ): Promise<StaffResponseDto> {
    const existingProfile = await this.prisma.profile.findFirst({
      where: { church_id: churchId },
    });

    if (existingProfile) {
      const { data: userData } = await this.supabase.client.auth.admin.getUserById(
        existingProfile.user_id,
      );
      if (userData?.user?.email === dto.email) {
        throw new ConflictException('A staff member with this email already exists in your church');
      }
    }

    const { data: inviteData, error: inviteError } =
      await this.supabase.client.auth.admin.inviteUserByEmail(dto.email, {
        data: {
          first_name: dto.firstName,
          last_name: dto.lastName,
          church_id: churchId,
          role: dto.role,
        },
        redirectTo: `${process.env['WEB_URL'] || 'http://localhost:3000'}/auth/callback`,
      });

    if (inviteError) {
      this.logger.error(`Supabase invite error: ${inviteError.message}`);
      throw new InternalServerErrorException('Failed to send staff invitation');
    }

    if (!inviteData?.user) {
      throw new InternalServerErrorException('Failed to create staff account');
    }

    const profile = await this.prisma.profile.create({
      data: {
        user_id: inviteData.user.id,
        church_id: churchId,
        branch_id: dto.branchId || null,
        role: dto.role,
        first_name: dto.firstName,
        last_name: dto.lastName,
        phone: dto.phone,
      },
    });

    let branchName: string | undefined;
    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
        select: { name: true },
      });
      branchName = branch?.name;
    }

    await this.audit.log({
      userId,
      churchId,
      entity: 'staff',
      action: 'CREATE',
      entityId: profile.id,
      newValues: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
    });

    this.logger.log(`Staff invited: ${dto.email} → ${dto.role} (${churchId})`);

    return {
      id: profile.id,
      userId: profile.user_id,
      email: dto.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      phone: profile.phone || undefined,
      role: profile.role,
      branchName,
      branchId: profile.branch_id || undefined,
      createdAt: profile.created_at.toISOString(),
    };
  }

  /**
   * Lists staff members with pagination and filtering.
   * Fetches emails from Supabase Auth for each staff member.
   * @param churchId - The church UUID
   * @param query - Pagination and filter parameters
   * @returns Array of StaffResponseDto and total count
   */
  async listStaff(
    churchId: string,
    query: { page?: number; limit?: number; search?: string; role?: string },
  ): Promise<{ data: StaffResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ProfileWhereInput = { church_id: churchId };

    if (query.role) {
      where.role = query.role;
    }

    const [profiles, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.profile.count({ where }),
    ]);

    const userIds = profiles.map((p) => p.user_id);
    const emailMap = await this.getEmailsByUserIds(userIds);

    const data = profiles.map((p) => ({
      id: p.id,
      userId: p.user_id,
      email: emailMap.get(p.user_id) || '',
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone || undefined,
      role: p.role,
      branchName: p.branch?.name,
      branchId: p.branch_id || undefined,
      createdAt: p.created_at.toISOString(),
    }));

    return { data, total };
  }

  /**
   * Updates a staff member's role.
   * @param churchId - The church UUID
   * @param profileId - The profile UUID to update
   * @param dto - New role data
   * @param userId - User performing the update (for audit log)
   * @returns Updated StaffResponseDto
   * @throws NotFoundException if staff member not found or doesn't belong to church
   */
  async updateStaffRole(
    churchId: string,
    profileId: string,
    dto: UpdateStaffRoleDto,
    userId: string,
  ): Promise<StaffResponseDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        branch: { select: { name: true } },
      },
    });

    if (!profile || profile.church_id !== churchId) {
      throw new NotFoundException('Staff member not found');
    }

    const oldRole = profile.role;

    const updated = await this.prisma.profile.update({
      where: { id: profileId },
      data: { role: dto.role },
      include: {
        branch: { select: { name: true } },
      },
    });

    let email = '';
    try {
      const { data: userData } = await this.supabase.client.auth.admin.getUserById(profile.user_id);
      email = userData?.user?.email || '';
    } catch {
      this.logger.warn(`Could not fetch email for user ${profile.user_id}`);
    }

    await this.audit.log({
      userId,
      churchId,
      entity: 'staff',
      action: 'UPDATE',
      entityId: profileId,
      oldValues: { role: oldRole },
      newValues: { role: dto.role },
    });

    this.logger.log(`Staff role updated: ${profileId} → ${dto.role}`);

    return {
      id: updated.id,
      userId: updated.user_id,
      email,
      firstName: updated.first_name,
      lastName: updated.last_name,
      phone: updated.phone || undefined,
      role: updated.role,
      branchName: updated.branch?.name,
      branchId: updated.branch_id || undefined,
      createdAt: updated.created_at.toISOString(),
    };
  }

  /**
   * Soft-deletes a staff member by setting role to "removed".
   * @param churchId - The church UUID
   * @param profileId - The profile UUID to remove
   * @param userId - User performing the removal (for audit log)
   * @returns Object with success status
   * @throws NotFoundException if staff member not found or doesn't belong to church
   */
  async removeStaff(
    churchId: string,
    profileId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile || profile.church_id !== churchId) {
      throw new NotFoundException('Staff member not found');
    }

    await this.prisma.profile.update({
      where: { id: profileId },
      data: { role: 'removed' },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'staff',
      action: 'DELETE',
      entityId: profileId,
      oldValues: { role: profile.role },
      newValues: { role: 'removed' },
    });

    this.logger.log(`Staff removed: ${profileId}`);

    return { success: true };
  }

  /**
   * Fetches emails from Supabase Auth for a batch of user IDs.
   * Processes in batches of 50 users.
   * @param userIds - Array of Supabase user IDs
   * @returns Map of user ID to email address
   */
  private async getEmailsByUserIds(userIds: string[]): Promise<Map<string, string>> {
    const emailMap = new Map<string, string>();
    if (userIds.length === 0) return emailMap;

    try {
      const pageSize = 50;
      for (let page = 0; page * pageSize < userIds.length; page++) {
        const batch = userIds.slice(page * pageSize, (page + 1) * pageSize);
        const { data } = await this.supabase.client.auth.admin.listUsers({
          page: page + 1,
          perPage: pageSize,
        });

        if (data?.users) {
          for (const user of data.users) {
            if (batch.includes(user.id) && user.email) {
              emailMap.set(user.id, user.email);
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch emails from Supabase: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return emailMap;
  }

  /**
   * Maps a Prisma Church object to a ChurchResponseDto.
   * @param church - Prisma Church object with optional counts
   * @returns ChurchResponseDto with camelCase properties
   */
  private mapToResponseDto(church: {
    id: string;
    name: string;
    denomination: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    logo_url: string | null;
    created_at: Date;
    updated_at: Date;
    _count?: { branches: number; members: number };
  }): ChurchResponseDto {
    return {
      id: church.id,
      name: church.name,
      denomination: church.denomination || undefined,
      address: church.address || undefined,
      city: church.city || undefined,
      state: church.state || undefined,
      country: church.country,
      phone: church.phone || undefined,
      email: church.email || undefined,
      website: church.website || undefined,
      logoUrl: church.logo_url || undefined,
      branchCount: church._count?.branches ?? 0,
      memberCount: church._count?.members ?? 0,
      createdAt: church.created_at.toISOString(),
      updatedAt: church.updated_at.toISOString(),
    };
  }
}
