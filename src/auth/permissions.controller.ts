/**
 * @file permissions.controller.ts
 * @description Controller for managing church-specific role permissions.
 *
 * Provides endpoints for church admins to view and customize which permissions
 * are assigned to each role within their church. Global defaults are used when
 * no church-specific overrides exist.
 *
 * @module auth/permissions.controller
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RequireRoles } from './decorators/roles.decorator';
import { PermissionsService } from './services/permissions.service';
import { CurrentUserProfile } from '../common/decorators/current-user.decorator';
import {
  SetRolePermissionsDto,
  RolePermissionsResponseDto,
  RolesSummaryResponseDto,
} from './dto/permissions.dto';

@ApiTags('Permissions')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('church/roles')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // ─── List All Roles with Permissions ─────────────────────

  @Get()
  @RequireRoles('church_admin', 'super_admin')
  @ApiOperation({ summary: 'List all roles with their effective permissions for this church' })
  @ApiResponse({
    status: 200,
    description: 'Roles summary returned',
    type: RolesSummaryResponseDto,
  })
  async getRolesSummary(
    @CurrentUserProfile('church_id') churchId: string,
  ): Promise<RolesSummaryResponseDto> {
    const roles = await this.permissionsService.getRolesSummary(churchId);
    return { roles };
  }

  // ─── Get Permissions for a Specific Role ─────────────────

  @Get(':roleName/permissions')
  @RequireRoles('church_admin', 'super_admin')
  @ApiOperation({ summary: 'Get effective permissions for a specific role' })
  @ApiResponse({
    status: 200,
    description: 'Role permissions returned',
    type: RolePermissionsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async getRolePermissions(
    @Param('roleName') roleName: string,
    @CurrentUserProfile('church_id') churchId: string,
  ): Promise<RolePermissionsResponseDto> {
    return this.permissionsService.getRolePermissions(churchId, roleName);
  }

  // ─── Set Permissions for a Role ──────────────────────────

  @Put(':roleName/permissions')
  @RequireRoles('church_admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set permissions for a role (replaces all current permissions)' })
  @ApiResponse({
    status: 200,
    description: 'Permissions updated successfully',
    type: RolePermissionsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot modify super_admin permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async setRolePermissions(
    @Param('roleName') roleName: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUserProfile('church_id') churchId: string,
  ): Promise<RolePermissionsResponseDto> {
    await this.permissionsService.setPermissionsForRole(churchId, roleName, dto.permissionIds);
    return this.permissionsService.getRolePermissions(churchId, roleName);
  }

  // ─── Reset Role to Defaults ──────────────────────────────

  @Post(':roleName/reset')
  @RequireRoles('church_admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a role to global default permissions' })
  @ApiResponse({
    status: 200,
    description: 'Role reset to defaults',
    type: RolePermissionsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot reset super_admin' })
  async resetRoleToDefaults(
    @Param('roleName') roleName: string,
    @CurrentUserProfile('church_id') churchId: string,
  ): Promise<RolePermissionsResponseDto> {
    await this.permissionsService.resetRoleToDefaults(churchId, roleName);
    return this.permissionsService.getRolePermissions(churchId, roleName);
  }

  // ─── List All Available Permissions ──────────────────────

  @Get('/all')
  @RequireRoles('church_admin', 'super_admin')
  @ApiOperation({ summary: 'List all available permissions (resource:action pairs)' })
  @ApiResponse({ status: 200, description: 'All permissions returned' })
  async getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }
}
