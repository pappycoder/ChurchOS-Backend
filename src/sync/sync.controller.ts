/**
 * @file sync.controller.ts
 * @description HTTP endpoints for offline data synchronization.
 *
 * @module sync/sync.controller
 * @since 1.0.0
 */

import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtPayload } from '../auth/strategies/jwt.strategy';
import {
  ApiCreateEndpoint,
  ApiGetEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { SyncService } from './sync.service';
import { SyncPushDto } from './dto/sync-push.dto';

@ApiTags('Sync')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * Push offline changes to the server.
   */
  @Post('push')
  @ApiCreateEndpoint(
    'Push offline changes',
    'Submits offline changes from mobile clients for server-side processing.',
  )
  async pushChanges(
    @Body() dto: SyncPushDto,
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<{
    accepted: number;
    rejected: number;
    conflicts: string[];
  }> {
    const profile = req['profile'] as { church_id: string };
    return this.syncService.pushChanges(profile.church_id, user.sub, dto.changes);
  }

  /**
   * Pull pending server changes.
   */
  @Get('pull')
  @ApiGetEndpoint(
    'Pull server changes',
    'Retrieves pending server-side changes for mobile client caching.',
  )
  @ApiQuery({ name: 'limit', required: false, description: 'Max items to return (default: 100)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor (ISO timestamp)' })
  async pullChanges(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Request() req?: Record<string, unknown>,
  ): Promise<{
    changes: {
      entity: string;
      entityId: string;
      action: string;
      data: Record<string, unknown>;
      createdAt: string;
    }[];
    hasMore: boolean;
  }> {
    const profile = req?.['profile'] as { church_id: string } | undefined;
    return this.syncService.pullChanges(
      profile?.church_id || '',
      limit ? parseInt(limit, 10) : 100,
      cursor,
    );
  }

  /**
   * Mark items as synced.
   */
  @Post('mark-synced')
  @ApiCreateEndpoint(
    'Mark as synced',
    'Marks sync queue items as processed after successful client-side application.',
  )
  async markSynced(
    @Body() body: { entityIds: string[] },
    @Request() req: Record<string, unknown>,
  ): Promise<{ marked: number }> {
    const profile = req['profile'] as { church_id: string };
    return this.syncService.markSynced(profile.church_id, body.entityIds);
  }
}
