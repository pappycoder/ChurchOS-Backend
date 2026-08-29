/**
 * @file Branch management controller with REST API endpoints.
 * @module BranchesController
 * @description Handles HTTP requests for branch CRUD operations.
 * All endpoints require JWT authentication and role-based access control.
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
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  CurrentUser,
  SupabaseUser,
  AuthenticatedRequest,
} from '../common/decorators/current-user.decorator';
import {
  ApiCreateEndpoint,
  ApiListEndpoint,
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiDeleteEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { BranchResponseDto } from './dto/branch-response.dto';

/**
 * Controller for branch management operations.
 * Provides endpoints for branch CRUD with multi-tenant isolation.
 * All endpoints require JWT authentication and role-based access control.
 */
@ApiTags('Branches')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('branches')
export class BranchesController {
  /**
   * Creates an instance of BranchesController.
   * @param branchesService - Service for branch operations
   */
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin', 'super_admin')
  @RequirePermissions('branches:create')
  @ApiCreateEndpoint(
    'Create a branch',
    'Creates a new branch for the church. Only one headquarters branch is allowed.',
  )
  /**
   * Creates a new branch for the church.
   * @param dto - Branch creation data
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns BranchResponseDto with created branch
   */
  async create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<BranchResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.branchesService.create(dto, churchId, user.id);
  }

  @Get()
  @RequireRoles('church_admin', 'super_admin', 'branch_pastor', 'secretary')
  @RequirePermissions('branches:read')
  @ApiPaginatedResponse(BranchResponseDto)
  @ApiListEndpoint('List branches', 'Returns a paginated list of branches for the church.')
  /**
   * Lists branches with pagination, search, and sorting.
   * @param query - Pagination and filter parameters
   * @param req - Authenticated request with user profile
   * @returns Array of BranchResponseDto and total count
   */
  async findAll(
    @Query() query: ListBranchesDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ data: BranchResponseDto[]; total: number }> {
    const churchId = req.profile?.church_id || '';
    return this.branchesService.findAll(churchId, query);
  }

  @Get(':branchId')
  @RequireRoles('church_admin', 'super_admin', 'branch_pastor', 'secretary')
  @RequirePermissions('branches:read')
  @ApiGetEndpoint('Get branch', 'Retrieves a single branch by ID with member count.')
  /**
   * Retrieves a single branch by ID.
   * @param branchId - Branch UUID
   * @param req - Authenticated request with user profile
   * @returns BranchResponseDto with branch details
   */
  async findOne(
    @Param('branchId') branchId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<BranchResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.branchesService.findOne(branchId, churchId);
  }

  @Patch(':branchId')
  @RequireRoles('church_admin', 'super_admin')
  @RequirePermissions('branches:update')
  @ApiUpdateEndpoint(
    'Update a branch',
    'Updates branch details. If photoUrl changes, the old image is deleted from storage.',
  )
  /**
   * Updates branch details.
   * @param branchId - Branch UUID
   * @param dto - Update data (all fields optional)
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns Updated BranchResponseDto
   */
  async update(
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<BranchResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.branchesService.update(branchId, dto, churchId, user.id);
  }

  @Delete(':branchId')
  @RequireRoles('church_admin', 'super_admin')
  @RequirePermissions('branches:delete')
  @ApiDeleteEndpoint(
    'Delete a branch',
    'Deletes a branch. Cannot delete if it has members assigned.',
  )
  /**
   * Deletes a branch.
   * @param branchId - Branch UUID
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns Object with success status
   */
  async remove(
    @Param('branchId') branchId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const churchId = req.profile?.church_id || '';
    return this.branchesService.remove(branchId, churchId, user.id);
  }

  @Post(':branchId/archive')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('church_admin', 'super_admin')
  @RequirePermissions('branches:update')
  /**
   * Archives a branch. Archived branches drop out of active lists.
   * @param branchId - Branch UUID
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns Updated BranchResponseDto
   */
  async archive(
    @Param('branchId') branchId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<BranchResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.branchesService.archive(branchId, churchId, user.id);
  }

  @Post(':branchId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('church_admin', 'super_admin')
  @RequirePermissions('branches:update')
  /**
   * Restores an archived branch.
   * @param branchId - Branch UUID
   * @param user - Current authenticated user
   * @param req - Authenticated request with user profile
   * @returns Updated BranchResponseDto
   */
  async restore(
    @Param('branchId') branchId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<BranchResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.branchesService.restore(branchId, churchId, user.id);
  }
}
