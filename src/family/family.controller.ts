/**
 * @file family.controller.ts
 * @description HTTP endpoints for family management.
 *
 * Provides REST endpoints for family CRUD, member addition/removal,
 * and listing with pagination. All endpoints require JWT authentication.
 * Write operations (create, update, delete, add/remove member) are restricted
 * to church_admin, branch_pastor, and secretary roles.
 *
 * @module family/family.controller
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
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import {
  AuthenticatedRequest,
  CurrentUser,
  SupabaseUser,
} from '../common/decorators/current-user.decorator';
import {
  ApiCreateEndpoint,
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiDeleteEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { FamilyService } from './family.service';
import { CreateFamilyDto, AddFamilyMemberDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { ListFamiliesDto } from './dto/list-families.dto';
import { FamilyResponseDto } from './dto/family-response.dto';

@ApiTags('Families')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('families')
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  /**
   * Creates a new family record.
   *
   * @param dto - Family creation data (name, optional head member ID)
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Created family response
   */
  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor', 'secretary')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Create a family', 'Creates a new family record.')
  async create(
    @Body() dto: CreateFamilyDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FamilyResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.familyService.createFamily(dto, churchId, user.sub);
  }

  /**
   * Lists families with pagination and search filtering.
   *
   * @param query - Query parameters for pagination and search
   * @param req - HTTP request with profile context
   * @returns Paginated list of families
   */
  @Get()
  @ApiPaginatedResponse(FamilyResponseDto)
  @ApiOperation({
    summary: 'List families',
    description: 'List families with pagination and search.',
  })
  async findAll(@Query() query: ListFamiliesDto, @Request() req: AuthenticatedRequest) {
    const churchId = req.profile?.church_id || '';
    const result = await this.familyService.listFamilies(churchId, query);
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
   * Gets a single family by ID with its member associations.
   *
   * @param familyId - Family UUID
   * @param req - HTTP request with profile context
   * @returns Family response with member details
   */
  @Get(':familyId')
  @ApiGetEndpoint('Get family by ID')
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  async findOne(
    @Param('familyId') familyId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<FamilyResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.familyService.getFamilyById(familyId, churchId);
  }

  /**
   * Updates a family record with partial data.
   *
   * @param familyId - Family UUID to update
   * @param dto - Update data (name, headId — all optional)
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Updated family response
   */
  @Patch(':familyId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor', 'secretary')
  @HttpCode(HttpStatus.OK)
  @ApiUpdateEndpoint('Update a family')
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  async update(
    @Param('familyId') familyId: string,
    @Body() dto: UpdateFamilyDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FamilyResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.familyService.updateFamily(familyId, dto, churchId, user.sub);
  }

  /**
   * Deletes a family and all its member associations.
   *
   * @param familyId - Family UUID to delete
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Success confirmation
   */
  @Delete(':familyId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @HttpCode(HttpStatus.OK)
  @ApiDeleteEndpoint('Delete a family')
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  async remove(
    @Param('familyId') familyId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const churchId = req.profile?.church_id || '';
    await this.familyService.deleteFamily(familyId, churchId, user.sub);
    return { success: true };
  }

  /**
   * Adds a profile member to a family.
   *
   * @param familyId - Family UUID to add the member to
   * @param dto - Member data (profileId, optional relationship, role)
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Updated family response with new member
   */
  @Post(':familyId/members')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor', 'secretary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add member to family' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  async addMember(
    @Param('familyId') familyId: string,
    @Body() dto: AddFamilyMemberDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FamilyResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.familyService.addMember(familyId, dto, churchId, user.sub);
  }

  /**
   * Removes a profile member from a family.
   *
   * @param familyId - Family UUID
   * @param memberId - Profile UUID to remove
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Updated family response without the removed member
   */
  @Delete(':familyId/members/:memberId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor', 'secretary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove member from family' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  @ApiParam({ name: 'memberId', description: 'Member UUID' })
  async removeMember(
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FamilyResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.familyService.removeMember(familyId, memberId, churchId, user.sub);
  }
}
