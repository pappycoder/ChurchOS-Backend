/**
 * @file notifications.service.ts
 * @description Service for in-app notification management.
 *
 * Handles notification creation, listing, read status, and preferences.
 * Notifications are church-scoped and profile-scoped.
 *
 * @module notifications/notifications.service
 * @since 1.0.0
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List notifications for a profile with pagination.
   */
  async listNotifications(
    churchId: string,
    profileId: string,
    page = 1,
    limit = 20,
    type?: string,
  ): Promise<{ data: NotificationResponseDto[]; total: number; unreadCount: number }> {
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      church_id: churchId,
      profile_id: profileId,
    };

    if (type) {
      where.type = type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { ...where, read_at: null },
      }),
    ]);

    return {
      data: notifications.map((n) => this.mapNotificationToDto(n)),
      total,
      unreadCount,
    };
  }

  /**
   * Get unread notification count for a profile.
   */
  async getUnreadCount(churchId: string, profileId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        church_id: churchId,
        profile_id: profileId,
        read_at: null,
      },
    });
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(
    notificationId: string,
    churchId: string,
    profileId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        church_id: churchId,
        profile_id: profileId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read_at: new Date() },
    });

    return this.mapNotificationToDto(updated);
  }

  /**
   * Mark all notifications as read for a profile.
   */
  async markAllAsRead(churchId: string, profileId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        church_id: churchId,
        profile_id: profileId,
        read_at: null,
      },
      data: { read_at: new Date() },
    });

    this.logger.log(`Marked ${result.count} notifications as read for profile ${profileId}`);

    return { updated: result.count };
  }

  /**
   * Create a notification (internal use by other services).
   */
  async createNotification(
    churchId: string,
    profileId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.create({
      data: {
        church_id: churchId,
        profile_id: profileId,
        type,
        title,
        body,
        data: data as Prisma.InputJsonValue,
      },
    });

    return this.mapNotificationToDto(notification);
  }

  /**
   * Send notifications to all profiles in a church (broadcast).
   */
  async broadcastToChurch(
    churchId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<{ sent: number }> {
    const profiles = await this.prisma.profile.findMany({
      where: { church_id: churchId },
      select: { id: true },
    });

    let sent = 0;

    for (const profile of profiles) {
      try {
        await this.prisma.notification.create({
          data: {
            church_id: churchId,
            profile_id: profile.id,
            type,
            title,
            body,
            data: data as Prisma.InputJsonValue,
          },
        });
        sent++;
      } catch (err) {
        this.logger.warn(
          `Failed to send notification to profile ${profile.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Broadcast notification to ${sent}/${profiles.length} profiles in church ${churchId}`,
    );

    return { sent };
  }

  private mapNotificationToDto(
    notification: Record<string, unknown> & { id: string; created_at: Date },
  ): NotificationResponseDto {
    return {
      id: notification.id,
      churchId: notification.church_id as string,
      profileId: notification.profile_id as string,
      type: notification.type as string,
      title: notification.title as string,
      body: notification.body as string,
      data: (notification.data as Record<string, unknown>) || undefined,
      readAt: notification.read_at ? (notification.read_at as Date).toISOString() : undefined,
      createdAt: notification.created_at.toISOString(),
    };
  }
}
