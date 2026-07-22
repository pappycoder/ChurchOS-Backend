/**
 * @file sync.service.ts
 * @description Service for offline data synchronization.
 *
 * Handles push/pull sync between mobile clients and the server.
 * Uses the existing SyncQueue Prisma model for tracking pending changes.
 *
 * Conflict resolution: last-write-wins based on clientTimestamp.
 * Idempotency: checks entity_id + action before inserting.
 *
 * @module sync/sync.service
 * @since 1.0.0
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { SyncChangeDto } from './dto/sync-push.dto';
import { Prisma } from '@prisma/client';

interface SyncResult {
  accepted: number;
  rejected: number;
  conflicts: string[];
}

interface PullResult {
  changes: {
    entity: string;
    entityId: string;
    action: string;
    data: Record<string, unknown>;
    createdAt: string;
  }[];
  hasMore: boolean;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  /**
   * Process offline changes from mobile clients.
   * Each change is validated and stored in the sync queue for processing.
   */
  async pushChanges(
    churchId: string,
    userId: string,
    changes: SyncChangeDto[],
  ): Promise<SyncResult> {
    if (!changes || changes.length === 0) {
      throw new BadRequestException('No changes provided');
    }

    let accepted = 0;
    let rejected = 0;
    const conflicts: string[] = [];

    for (const change of changes) {
      try {
        // Check for idempotency — skip if already synced
        const existing = await this.prisma.syncQueue.findFirst({
          where: {
            church_id: churchId,
            entity: change.entity,
            entity_id: change.entityId,
            action: change.action,
            synced: true,
          },
        });

        if (existing) {
          this.logger.debug(`Skipping already-synced change: ${change.entity}/${change.entityId}`);
          accepted++;
          continue;
        }

        // Check for conflicts — last-write-wins
        const pending = await this.prisma.syncQueue.findFirst({
          where: {
            church_id: churchId,
            entity: change.entity,
            entity_id: change.entityId,
            synced: false,
          },
          orderBy: { created_at: 'desc' },
        });

        if (pending && change.clientTimestamp) {
          const pendingTime = new Date(pending.created_at).getTime();
          const clientTime = new Date(change.clientTimestamp).getTime();

          if (clientTime < pendingTime) {
            this.logger.debug(
              `Conflict rejected: ${change.entity}/${change.entityId} (older client timestamp)`,
            );
            conflicts.push(`${change.entity}/${change.entityId}`);
            rejected++;
            continue;
          }
        }

        // Store the change in the sync queue
        await this.prisma.syncQueue.create({
          data: {
            church_id: churchId,
            entity: change.entity,
            entity_id: change.entityId,
            action: change.action,
            data: change.data as Prisma.InputJsonValue,
          },
        });

        accepted++;
      } catch (err) {
        this.logger.error(
          `Failed to process sync change ${change.entity}/${change.entityId}: ${(err as Error).message}`,
        );
        rejected++;
      }
    }

    await this.audit.log({
      userId,
      churchId,
      entity: 'sync',
      action: 'CREATE',
      entityId: 'batch',
      newValues: { accepted, rejected, conflicts: conflicts.length },
    });

    this.logger.log(
      `Sync push: ${accepted} accepted, ${rejected} rejected, ${conflicts.length} conflicts`,
    );

    return { accepted, rejected, conflicts };
  }

  /**
   * Pull pending server-side changes for a mobile client.
   * Returns unsynced changes from the sync queue.
   */
  async pullChanges(churchId: string, limit = 100, cursor?: string): Promise<PullResult> {
    const where: Prisma.SyncQueueWhereInput = {
      church_id: churchId,
      synced: false,
    };

    if (cursor) {
      where.created_at = { gt: new Date(cursor) };
    }

    const changes = await this.prisma.syncQueue.findMany({
      where,
      orderBy: { created_at: 'asc' },
      take: limit + 1, // Fetch one extra to determine hasMore
    });

    const hasMore = changes.length > limit;
    const items = hasMore ? changes.slice(0, limit) : changes;

    return {
      changes: items.map((c) => ({
        entity: c.entity,
        entityId: c.entity_id,
        action: c.action,
        data: (c.data as Record<string, unknown>) || {},
        createdAt: c.created_at.toISOString(),
      })),
      hasMore,
    };
  }

  /**
   * Mark sync queue items as processed.
   */
  async markSynced(churchId: string, entityIds: string[]): Promise<{ marked: number }> {
    const result = await this.prisma.syncQueue.updateMany({
      where: {
        church_id: churchId,
        entity_id: { in: entityIds },
        synced: false,
      },
      data: {
        synced: true,
        synced_at: new Date(),
      },
    });

    return { marked: result.count };
  }
}
