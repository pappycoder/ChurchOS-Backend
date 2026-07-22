/**
 * @file users.controller.ts
 * @description HTTP endpoints for user management.
 *
 * Provides CRUD operations for church users (staff accounts),
 * including invitation, deactivation, and password reset.
 *
 * @module users/users.controller
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtPayload } from '../auth/strategies/jwt.strategy';
import {
  ApiCreateEndpoint,
  ApiGetEndpoint,
  ApiUpdateEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ListUsersDto } from './dto/list-users.dto';

@ApiTags('Users')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private getProfile(req: Record<string, unknown>): { church_id: string } {
    return req['profile'] as { church_id: string };
  }

  /**
   * List all users for the church.
   */
  @Get()
  @RequireRoles('super_admin', 'senior_pastor', 'church_admin')
  @ApiPaginatedResponse(UserResponseDto)
  @ApiOperation({
    summary: 'List church users',
    description: 'Lists all staff/users for the authenticated user\'s church.',
  })
  async listUsers(
    @Query() query: ListUsersDto,
    @Request() req: Record<string, unknown>,
  ): Promise<{ data: UserResponseDto[]; total: number }> {
    const churchId = this.getProfile(req).church_id;
    return this.usersService.listUsers(
      churchId,
      query.page ? parseInt(query.page, 10) : 1,
      query.limit ? parseInt(query.limit, 10) : 20,
      query.search,
      query.role,
      query.status,
      query.sortBy,
      query.sortOrder,
    );
  }

  /**
   * Get a single user by ID.
   */
  @Get(':userId')
  @RequireRoles('super_admin', 'senior_pastor', 'church_admin')
  @ApiGetEndpoint('Get user details', 'Retrieves a single user by ID within the same church.')
  async getUser(
    @Param('userId') userId: string,
    @Request() req: Record<string, unknown>,
  ): Promise<UserResponseDto> {
    return this.usersService.getUserById(userId, this.getProfile(req).church_id);
  }

  /**
   * Invite a new user via email.
   */
  @Post('invite')
  @RequireRoles('super_admin', 'senior_pastor', 'church_admin')
  @ApiCreateEndpoint(
    'Invite a new user',
    'Sends an email invitation and creates a Profile record for the new user.',
  )
  async inviteUser(
    @Body() dto: InviteUserDto,
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<UserResponseDto> {
    return this.usersService.inviteUser(dto, this.getProfile(req).church_id, user.sub);
  }

  /**
   * Update a user's profile.
   */
  @Patch(':userId')
  @RequireRoles('super_admin', 'senior_pastor', 'church_admin')
  @ApiUpdateEndpoint('Update user details', 'Updates a user\'s profile information.')
  async updateUser(
    @Param('userId') userId: string,
    @Body()
    body: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      branchId?: string;
    },
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(userId, this.getProfile(req).church_id, user.sub, body);
  }

  /**
   * Deactivate a user account.
   */
  @Post(':userId/deactivate')
  @RequireRoles('super_admin', 'senior_pastor', 'church_admin')
  @ApiCreateEndpoint(
    'Deactivate user',
    'Disables the user\'s Supabase Auth account and marks the profile as inactive.',
  )
  async deactivateUser(
    @Param('userId') userId: string,
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<{ deactivated: boolean }> {
    return this.usersService.deactivateUser(userId, this.getProfile(req).church_id, user.sub);
  }

  /**
   * Reset a user's password.
   */
  @Post(':userId/reset-password')
  @RequireRoles('super_admin', 'senior_pastor', 'church_admin')
  @ApiCreateEndpoint(
    'Reset user password',
    'Generates and sends a password reset link to the user\'s email.',
  )
  async resetPassword(
    @Param('userId') userId: string,
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<{ resetSent: boolean }> {
    return this.usersService.resetUserPassword(userId, this.getProfile(req).church_id, user.sub);
  }

  /**
   * Force sign-out a user.
   */
  @Post(':userId/force-signout')
  @RequireRoles('super_admin', 'senior_pastor', 'church_admin')
  @ApiCreateEndpoint(
    'Force sign-out',
    'Invalidates all refresh tokens for the user, forcing them to re-authenticate.',
  )
  async forceSignOut(
    @Param('userId') userId: string,
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<{ signedOut: boolean }> {
    return this.usersService.forceSignOut(userId, this.getProfile(req).church_id, user.sub);
  }
}
