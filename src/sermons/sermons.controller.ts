/**
 * @file sermons.controller.ts
 * @description HTTP endpoints for sermon management.
 *
 * Provides sermon CRUD with search, filtering, and pagination.
 *
 * @module sermons/sermons.controller
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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { CurrentUser, SupabaseUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import {
  ApiCreateEndpoint,
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiDeleteEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { SermonsService } from './sermons.service';
import { CreateSermonDto } from './dto/create-sermon.dto';
import { UpdateSermonDto } from './dto/update-sermon.dto';
import { ListSermonsDto } from './dto/list-sermons.dto';
import { SermonResponseDto } from './dto/sermon-response.dto';

/**
 * Controller for sermon management.
 */
@ApiTags('Sermons')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('sermons')
export class SermonsController {
  constructor(private readonly sermonsService: SermonsService) {}

  /**
   * Create a new sermon record.
   */
  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @ApiCreateEndpoint('Create a sermon', 'Creates a new sermon record for the church.')
  async createSermon(
    @Body() dto: CreateSermonDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<SermonResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.sermonsService.createSermon(dto, churchId, user.sub);
  }

  /**
   * List sermons with pagination and filters.
   */
  @Get()
  @ApiPaginatedResponse(SermonResponseDto)
  @ApiOperation({
    summary: 'List sermons',
    description: 'List church sermons with search, filtering, and pagination.',
  })
  async listSermons(
    @Query() dto: ListSermonsDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ data: SermonResponseDto[]; total: number }> {
    const churchId = req.profile?.church_id || '';
    return this.sermonsService.listSermons(dto, churchId);
  }

  /**
   * Get a single sermon by ID.
   */
  @Get(':sermonId')
  @ApiGetEndpoint('Get sermon details')
  @ApiParam({ name: 'sermonId', description: 'Sermon UUID' })
  async getSermon(
    @Param('sermonId') sermonId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<SermonResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.sermonsService.getSermon(sermonId, churchId);
  }

  /**
   * Update a sermon.
   */
  @Patch(':sermonId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @ApiUpdateEndpoint('Update sermon details')
  @ApiParam({ name: 'sermonId', description: 'Sermon UUID' })
  async updateSermon(
    @Param('sermonId') sermonId: string,
    @Body() dto: UpdateSermonDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<SermonResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.sermonsService.updateSermon(sermonId, dto, churchId, user.sub);
  }

  /**
   * Delete a sermon.
   */
  @Delete(':sermonId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @ApiDeleteEndpoint('Delete a sermon')
  @ApiParam({ name: 'sermonId', description: 'Sermon UUID' })
  async deleteSermon(
    @Param('sermonId') sermonId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    return this.sermonsService.deleteSermon(sermonId, churchId, user.sub);
  }
}
