/**
 * @file auth.service.ts
 * @description Auth business logic for registration, profile retrieval, and session management.
 *
 * Handles Supabase Auth user creation, ChurchOS Profile creation, and
 * profile lookup. All mutations are audit-logged.
 *
 * @module auth/auth.service
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto, ProfileResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly audit: AuditLoggingService,
  ) {}

  /**
   * Registers a new church admin user.
   *
   * Flow:
   * 1. Create Supabase Auth user (email/password)
   * 2. Create Church record
   * 3. Create Profile linking Supabase user to church with church_admin role
   * 4. Audit-log the registration
   *
   * @param dto - Registration data
   * @returns Registration response with userId, profileId, churchId
   * @throws ConflictException if email is already registered
   * @throws InternalServerErrorException if Supabase or DB operations fail
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    // Step 1: Create Supabase Auth user
    const { data: authData, error: authError } = await this.supabase.client.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: {
          first_name: dto.firstName,
          last_name: dto.lastName,
          church_name: dto.churchName,
        },
      },
    });

    if (authError) {
      if (authError.message?.includes('already registered')) {
        throw new ConflictException('An account with this email already exists');
      }
      this.logger.error(`Supabase signUp failed: ${authError.message}`);
      throw new InternalServerErrorException('Failed to create user account');
    }

    if (!authData.user) {
      throw new InternalServerErrorException('Failed to create user account');
    }

    const userId = authData.user.id;

    // Step 2 & 3: Create Church + Profile in a transaction
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Create church
        const church = await tx.church.create({
          data: {
            name: dto.churchName,
            denomination: dto.denomination,
          },
        });

        // Create admin profile
        const profile = await tx.profile.create({
          data: {
            user_id: userId,
            church_id: church.id,
            role: 'church_admin',
            first_name: dto.firstName,
            last_name: dto.lastName,
            phone: dto.phone,
          },
        });

        return { church, profile };
      });

      // Audit-log the registration
      await this.audit.log({
        userId,
        churchId: result.church.id,
        entity: 'auth',
        action: 'CREATE',
        entityId: result.profile.id,
        newValues: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          churchName: dto.churchName,
        },
      });

      this.logger.log(`User registered: ${dto.email} → ${result.church.name}`);

      return {
        userId,
        email: dto.email,
        profileId: result.profile.id,
        churchId: result.church.id,
        churchName: result.church.name,
        role: result.profile.role,
      };
    } catch (error) {
      // If Prisma fails after Supabase user was created, log but don't rethrow auth user
      this.logger.error(
        `Failed to create church/profile for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to complete registration');
    }
  }

  /**
   * Retrieves the full profile for an authenticated user.
   *
   * @param userId - Supabase Auth user ID (from JWT sub claim)
   * @returns Profile with church and branch details
   * @throws NotFoundException if no profile exists for the user
   */
  async getProfile(userId: string): Promise<ProfileResponseDto> {
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

    return {
      id: profile.id,
      userId: profile.user_id,
      churchId: profile.church_id,
      branchId: profile.branch_id || undefined,
      role: profile.role,
      firstName: profile.first_name,
      lastName: profile.last_name,
      phone: profile.phone || undefined,
      mfaEnabled: profile.mfa_enabled,
      church: profile.church
        ? {
            id: profile.church.id,
            name: profile.church.name,
            denomination: profile.church.denomination || undefined,
            logoUrl: profile.church.logo_url || undefined,
          }
        : undefined,
      branch: profile.branch
        ? {
            id: profile.branch.id,
            name: profile.branch.name,
            isHeadquarters: profile.branch.is_headquarters,
          }
        : undefined,
    };
  }
}
