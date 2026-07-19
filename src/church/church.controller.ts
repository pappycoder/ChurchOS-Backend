/**
 * @file Church management controller with REST API endpoints.
 * @module ChurchController
 * @description Handles HTTP requests for church details, configuration, and staff management.
 * All endpoints require JWT authentication and appropriate roles via RBAC.
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  SupabaseUser,
  AuthenticatedRequest,
} from '../common/decorators/current-user.decorator';
import {
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiCreateEndpoint,
  ApiDeleteEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ChurchService } from './church.service';
import { UpdateChurchDto } from './dto/update-church.dto';
import { ChurchResponseDto } from './dto/church-response.dto';
import { UpdateChurchConfigDto } from './dto/update-church-config.dto';
import { ChurchConfigResponseDto } from './dto/church-config-response.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { StaffResponseDto } from './dto/staff-response.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';

/**
 * Controller for church management operations.
 * Provides endpoints for church details, configuration, and staff CRUD.
 * All endpoints require JWT authentication and role-based access control.
 */
@ApiTags('Church')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('church')
export class ChurchController {
  /**
   * Creates an instance of ChurchController.
   * @param churchService - Service for church operations
   */
  constructor(private readonly churchService: ChurchService) {}

  @Get()
  @RequireRoles('church_admin', 'super_admin', 'branch_pastor', 'secretary', 'treasurer', 'member')
  @ApiGetEndpoint(
    'Get church details',
    'Retrieves the current church details including branch and member counts.',
  )
  /**
   * Retrieves the current church details.
   * @param req - Authenticated request with user profile
   * @returns ChurchResponseDto with church details
   */
  async getChurch(@Request() req: AuthenticatedRequest): Promise<ChurchResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.churchService.getChurch(churchId);
  }

  @Patch()
  @RequireRoles('church_admin', 'super_admin')
  @ApiUpdateEndpoint(
    'Update church details',
    'Updates church details. Only church_admin and super_admin can update.',
  )
  /**
   * Updates church details.
   * @param dto - Update data (all fields optional)
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns Updated ChurchResponseDto
   */
  async updateChurch(
    @Body() dto: UpdateChurchDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<ChurchResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.churchService.updateChurch(churchId, dto, user.id);
  }

  @Get('config')
  @RequireRoles('church_admin', 'super_admin')
  @ApiGetEndpoint(
    'Get church configuration',
    'Retrieves all configuration key-value pairs for the church.',
  )
  /**
   * Retrieves all church configuration key-value pairs.
   * @param req - Authenticated request with user profile
   * @returns ChurchConfigResponseDto with all config values
   */
  async getConfig(@Request() req: AuthenticatedRequest): Promise<ChurchConfigResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.churchService.getChurchConfig(churchId);
  }

  @Patch('config')
  @RequireRoles('church_admin', 'super_admin')
  @ApiUpdateEndpoint(
    'Update church configuration',
    'Upserts configuration key-value pairs for the church.',
  )
  /**
   * Upserts church configuration key-value pairs.
   * @param dto - Config key-value pairs to upsert
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns Updated ChurchConfigResponseDto
   */
  async updateConfig(
    @Body() dto: UpdateChurchConfigDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<ChurchConfigResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.churchService.updateChurchConfig(churchId, dto, user.id);
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin')
  @ApiCreateEndpoint(
    'Invite staff member',
    'Sends a Supabase Auth invitation email and creates a Profile record for the new staff member.',
  )
  /**
   * Invites a staff member via Supabase Auth invitation.
   * @param dto - Staff invitation details
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns StaffResponseDto with created profile
   */
  async inviteStaff(
    @Body() dto: InviteStaffDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<StaffResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.churchService.inviteStaff(churchId, dto, user.id);
  }

  @Get('staff')
  @RequireRoles('church_admin')
  @ApiGetEndpoint(
    'List staff members',
    'Returns a paginated list of all staff profiles for the church.',
  )
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term for name/email' })
  @ApiQuery({ name: 'role', required: false, type: String, description: 'Filter by role' })
  /**
   * Lists staff members with pagination and filtering.
   * @param page - Page number (optional)
   * @param limit - Items per page (optional)
   * @param search - Search term for name/email (optional)
   * @param role - Filter by role (optional)
   * @param req - Authenticated request with user profile
   * @returns Array of StaffResponseDto and total count
   */
  async listStaff(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Request() req?: AuthenticatedRequest,
  ): Promise<{ data: StaffResponseDto[]; total: number }> {
    const churchId = req?.profile?.church_id || '';
    return this.churchService.listStaff(churchId, { page, limit, search, role });
  }

  @Patch('staff/:id/role')
  @RequireRoles('church_admin')
  @ApiUpdateEndpoint('Update staff role', 'Changes the role of a staff member within the church.')
  /**
   * Updates a staff member's role.
   * @param id - Profile UUID
   * @param dto - New role data
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns Updated StaffResponseDto
   */
  async updateStaffRole(
    @Param('id') id: string,
    @Body() dto: UpdateStaffRoleDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<StaffResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.churchService.updateStaffRole(churchId, id, dto, user.id);
  }

  @Delete('staff/:id')
  @RequireRoles('church_admin')
  @ApiDeleteEndpoint(
    'Remove staff member',
    'Soft-deletes a staff member by setting their role to "removed".',
  )
  /**
   * Soft-deletes a staff member by setting role to "removed".
   * @param id - Profile UUID
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns Object with success status
   */
  async removeStaff(
    @Param('id') id: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const churchId = req.profile?.church_id || '';
    return this.churchService.removeStaff(churchId, id, user.id);
  }
}
