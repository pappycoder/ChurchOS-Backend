/**
 * @file broadcast.controller.ts
 * @description HTTP endpoints for broadcast messaging.
 *
 * Provides REST endpoints for creating, listing, retrieving, and cancelling
 * broadcast campaigns. Write operations are restricted to church_admin,
 * branch_pastor, and secretary roles.
 *
 * @module broadcast/broadcast.controller
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
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { BroadcastService } from './broadcast.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { ListBroadcastsDto } from './dto/list-broadcasts.dto';
import { BroadcastResponseDto } from './dto/broadcast-response.dto';

@ApiTags('Broadcasts')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('broadcasts')
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  /**
   * Creates a new broadcast campaign.
   */
  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor', 'secretary')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint(
    'Create a broadcast',
    'Creates a broadcast campaign using a published template and audience filter.',
  )
  async create(
    @Body() dto: CreateBroadcastDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<BroadcastResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.broadcastService.create(dto, churchId, user.sub);
  }

  /**
   * Lists broadcasts with pagination and filters.
   */
  @Get()
  @ApiPaginatedResponse(BroadcastResponseDto)
  @ApiOperation({ summary: 'List broadcasts', description: 'List broadcast campaigns.' })
  async findAll(@Query() query: ListBroadcastsDto, @Request() req: AuthenticatedRequest) {
    const churchId = req.profile?.church_id || '';
    const result = await this.broadcastService.findAll(churchId, query);
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
   * Gets a single broadcast by ID.
   */
  @Get(':broadcastId')
  @ApiGetEndpoint('Get broadcast by ID')
  @ApiParam({ name: 'broadcastId', description: 'Broadcast UUID' })
  async findOne(
    @Param('broadcastId') broadcastId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<BroadcastResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.broadcastService.findById(broadcastId, churchId);
  }

  /**
   * Cancels a scheduled or draft broadcast.
   */
  @Patch(':broadcastId/cancel')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor', 'secretary')
  @ApiUpdateEndpoint('Cancel a broadcast')
  @ApiParam({ name: 'broadcastId', description: 'Broadcast UUID' })
  async cancel(
    @Param('broadcastId') broadcastId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const churchId = req.profile?.church_id || '';
    await this.broadcastService.cancel(broadcastId, churchId, user.sub);
    return { success: true };
  }
}
