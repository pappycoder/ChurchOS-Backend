/**
 * @file notifications.controller.ts
 * @description HTTP endpoints for in-app notification management.
 *
 * @module notifications/notifications.controller
 * @since 1.0.0
 */

import { Controller, Get, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseJwtPayload } from '../auth/strategies/jwt.strategy';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import {
  ApiGetEndpoint,
  ApiUpdateEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto/notification-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private getProfile(req: Record<string, unknown>): { church_id: string; id: string } {
    return req['profile'] as { church_id: string; id: string };
  }

  /**
   * List notifications for the current user.
   */
  @Get()
  @ApiPaginatedResponse(NotificationResponseDto)
  @ApiOperation({
    summary: 'List notifications',
    description: 'Lists notifications for the authenticated user with pagination.',
  })
  async listNotifications(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Request() req?: Record<string, unknown>,
  ): Promise<{ data: NotificationResponseDto[]; total: number; unreadCount: number }> {
    const profile = req ? this.getProfile(req) : { church_id: '', id: '' };
    return this.notificationsService.listNotifications(
      profile.church_id,
      profile.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      type,
    );
  }

  /**
   * Get unread notification count.
   */
  @Get('unread-count')
  @ApiGetEndpoint(
    'Get unread count',
    'Returns the count of unread notifications for the current user.',
  )
  @ApiOperation({
    summary: 'Get unread count',
    description: 'Returns the number of unread notifications.',
  })
  async getUnreadCount(
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<{ count: number }> {
    const profile = this.getProfile(req);
    const count = await this.notificationsService.getUnreadCount(profile.church_id, user.sub);
    return { count };
  }

  /**
   * Mark a notification as read.
   */
  @Patch(':notificationId/read')
  @ApiUpdateEndpoint('Mark as read', 'Marks a single notification as read.')
  async markAsRead(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<NotificationResponseDto> {
    const profile = this.getProfile(req);
    return this.notificationsService.markAsRead(notificationId, profile.church_id, user.sub);
  }

  /**
   * Mark all notifications as read.
   */
  @Patch('read-all')
  @ApiUpdateEndpoint('Mark all as read', 'Marks all notifications as read for the current user.')
  async markAllAsRead(
    @CurrentUser() user: SupabaseJwtPayload,
    @Request() req: Record<string, unknown>,
  ): Promise<{ updated: number }> {
    const profile = this.getProfile(req);
    return this.notificationsService.markAllAsRead(profile.church_id, user.sub);
  }
}
