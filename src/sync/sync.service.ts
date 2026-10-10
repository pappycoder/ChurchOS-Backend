/**
 * @file sync.service.ts
 * @description Service for offline data synchronization.
 *
 * Handles push/pull sync between mobile clients and the server.
 *
 * Push flow: a client's offline changes are validated, applied to the real
 * database tables (church-scoped), and recorded in the SyncQueue outbox so
 * other clients can pull the same change (propagation).
 *
 * Pull flow: clients pull pending SyncQueue entries as a delta, apply them
 * locally, then acknowledge them via markSynced().
 *
 * Bootstrap flow: a fresh client calls bootstrap() to receive a full snapshot
 * of the church's core collections.
 *
 * Conflict resolution: last-write-wins based on clientTimestamp.
 * Idempotency: checks entity_id + action before inserting; applies use upsert.
 *
 * @module sync/sync.service
 * @since 1.0.0
 */

import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { SyncChangeDto } from './dto/sync-push.dto';
import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateOrReject, isUUID } from 'class-validator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { CreateMemberDto } from '../members/dto/create-member.dto';
import { UpdateMemberDto } from '../members/dto/update-member.dto';
import { CreateVisitorDto } from '../visitors/dto/create-visitor.dto';
import { UpdateVisitorDto } from '../visitors/dto/update-visitor.dto';
import { CreateLifeEventDto } from '../pastoral/dto/create-life-event.dto';
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
    data: Record<string, unknown> | null;
    createdAt: string;
  }[];
  hasMore: boolean;
  /** Resume cursor: the created_at of the last returned change */
  cursor: string | null;
}

export interface BootstrapResult {
  churchId: string;
  generatedAt: string;
  revision: string;
  nextCursors?: Record<string, string | null>;
  collections: {
    members: Record<string, unknown>[];
    services: Record<string, unknown>[];
    givingCategories: Record<string, unknown>[];
    visitors: Record<string, unknown>[];
    attendance: Record<string, unknown>[];
    transactions: Record<string, unknown>[];
  };
}

interface EntityFieldConfig {
  /** Prisma delegate name on the transaction client */
  delegate: string;
  /** Maps camelCase payload keys to snake_case model columns */
  fields: Record<string, string>;
  /** camelCase keys whose values are ISO date strings */
  dates: string[];
}

type SyncViewer = NonNullable<AuthenticatedRequest['profile']>;
const READ_PERMISSIONS: Record<string, string> = {
  member: 'members:all:read',
  service: 'attendance:services:read',
  givingCategory: 'giving:categories:read',
  visitor: 'visitors:list:read',
  attendance: 'attendance:records:read',
  transaction: 'giving:records:read',
  lifeEvent: 'pastoral:life-events:read',
  sermonBookmark: 'sermons:list:read',
  eventRegistration: 'events:registrations:read',
};

const ENTITY_CONFIGS: Record<string, EntityFieldConfig> = {
  service: { delegate: 'service', fields: {}, dates: [] },
  givingCategory: { delegate: 'givingCategory', fields: {}, dates: [] },
  member: {
    delegate: 'member',
    fields: {
      branchId: 'branch_id',
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      whatsappNumber: 'whatsapp_number',
      dateOfBirth: 'date_of_birth',
      gender: 'gender',
      address: 'address',
      city: 'city',
      state: 'state',
      status: 'status',
      memberSince: 'member_since',
      photoUrl: 'photo_url',
      customFields: 'custom_fields',
      notes: 'notes',
    },
    dates: ['dateOfBirth', 'memberSince'],
  },
  attendance: {
    delegate: 'attendance',
    fields: {
      serviceId: 'service_id',
      memberId: 'member_id',
      visitorName: 'visitor_name',
      checkinAt: 'checkin_at',
      source: 'source',
    },
    dates: ['checkinAt'],
  },
  visitor: {
    delegate: 'visitor',
    fields: {
      branchId: 'branch_id',
      firstName: 'first_name',
      lastName: 'last_name',
      phone: 'phone',
      whatsappNumber: 'whatsapp_number',
      email: 'email',
      firstVisitDate: 'first_visit_date',
      followUpStatus: 'follow_up_status',
      assignedToId: 'assigned_to_id',
      notes: 'notes',
      convertedMemberId: 'converted_member_id',
      convertedAt: 'converted_at',
    },
    dates: ['firstVisitDate', 'convertedAt'],
  },
  transaction: {
    delegate: 'transaction',
    fields: {
      branchId: 'branch_id',
      memberId: 'member_id',
      categoryId: 'category_id',
      amount: 'amount',
      currency: 'currency',
      type: 'type',
      status: 'status',
      paymentReference: 'payment_reference',
      paymentGateway: 'payment_gateway',
      paymentMethod: 'payment_method',
      receiptNumber: 'receipt_number',
      metadata: 'metadata',
      notes: 'notes',
    },
    dates: [],
  },
  lifeEvent: {
    delegate: 'lifeEvent',
    fields: {
      memberId: 'member_id',
      type: 'type',
      date: 'date',
      details: 'details',
      notified: 'notified',
    },
    dates: ['date'],
  },
  sermonBookmark: {
    delegate: 'sermonBookmark',
    fields: {
      memberId: 'member_id',
      sermonId: 'sermon_id',
    },
    dates: [],
  },
  eventRegistration: {
    delegate: 'eventRegistration',
    fields: {
      eventId: 'event_id',
      memberId: 'member_id',
      tierId: 'tier_id',
      transactionId: 'transaction_id',
      ticketId: 'ticket_id',
      customData: 'custom_data',
      paymentStatus: 'payment_status',
      paymentReference: 'payment_reference',
      quantity: 'quantity',
      checkedIn: 'checked_in',
      checkedInAt: 'checked_in_at',
    },
    dates: ['checkedInAt'],
  },
};

interface DelegateLike {
  findFirst(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
  upsert(args: {
    where: { id: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
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
   *
   * Each change is validated for idempotency and conflicts, then applied to
   * the real database tables and written to the SyncQueue outbox so other
   * clients can pull the change.
   */
  async pushChanges(
    churchId: string,
    userId: string,
    changes: SyncChangeDto[],
    viewer?: SyncViewer,
  ): Promise<SyncResult> {
    this.requireViewer(churchId, viewer);
    if (!changes || changes.length === 0 || changes.length > 100) {
      throw new BadRequestException('No changes provided');
    }

    let accepted = 0;
    let rejected = 0;
    const conflicts: string[] = [];

    for (const change of changes) {
      try {
        this.assertWritePermission(change, viewer!);
        const mutationId = createHash('sha256')
          .update(
            JSON.stringify([
              userId,
              change.mutationId ?? null,
              change.entity,
              change.entityId,
              change.action,
              change.clientTimestamp,
              change.data,
            ]),
          )
          .digest('hex');
        // A mutation ID identifies an operation, rather than every update to a record.
        const existing = await this.prisma.syncQueue.findFirst({
          where: {
            church_id: churchId,
            mutation_id: mutationId,
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

        // Apply the change to the real tables and record it in the outbox
        // atomically so propagation never diverges from the source of truth.
        // The session GUC suppresses the sync_outbox trigger during the apply
        // so device-originated changes are recorded exactly once here.
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.sync_outbox.skip', 'true', true)`;
          const applied = await this.applyChange(tx, change, churchId, viewer!);
          await tx.syncQueue.create({
            data: {
              church_id: churchId,
              entity: change.entity,
              entity_id: change.entityId,
              action: change.action,
              data: applied as Prisma.InputJsonValue,
              mutation_id: mutationId,
            },
          });
        });

        accepted++;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String(err.meta?.target).includes('mutation_id')
        ) {
          accepted++;
          continue;
        }
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
   * Pull pending server-side changes for a client device.
   *
   * Returns changes created after the device's watermark, hydrated to their
   * live camelCase state. Deleted records come back as tombstones
   * (data: null) so clients can remove them locally.
   *
   * Each device keeps a watermark (SyncDevice.last_pull_cursor) as a
   * fallback for clients that lose their cursor. Clients that track their
   * own cursor pass it back via the `cursor` parameter, which takes
   * precedence and avoids any risk of skipping an unapplied change.
   *
   * @param churchId - Church ID to scope the pull
   * @param deviceId - Stable client install identifier
   * @param limit - Max items to return (default: 100)
   * @param cursor - Client-side resume cursor (ISO timestamp)
   * @returns Hydrated changes, hasMore flag, and the resume cursor
   */
  async pullChanges(
    churchId: string,
    deviceId: string,
    limit = 100,
    cursor?: string,
    viewer?: SyncViewer,
  ): Promise<PullResult> {
    this.requireViewer(churchId, viewer);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || deviceId.length > 100)
      throw new BadRequestException('Invalid sync page size or device ID');
    deviceId = `${viewer!.id}:${deviceId}`;
    const device = await this.prisma.syncDevice.upsert({
      where: { church_id_device_id: { church_id: churchId, device_id: deviceId } },
      create: { church_id: churchId, device_id: deviceId },
      update: { last_seen_at: new Date() },
    });

    let cursorId: string | undefined;
    let cursorDate = device.last_pull_cursor ?? new Date(0);
    if (cursor) {
      if (cursor.length > 300) throw new BadRequestException('Invalid cursor');
      if (cursor.startsWith('v2:')) {
        try {
          const parsed = JSON.parse(Buffer.from(cursor.slice(3), 'base64url').toString());
          cursorDate = new Date(parsed.date);
          cursorId = parsed.id;
        } catch {
          throw new BadRequestException('Invalid cursor');
        }
        if (typeof cursorId !== 'string' || !isUUID(cursorId))
          throw new BadRequestException('Invalid cursor');
      } else cursorDate = new Date(cursor);
    }

    if (Number.isNaN(cursorDate.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    const rows = await this.prisma.syncQueue.findMany({
      where: {
        church_id: churchId,
        ...(cursorId
          ? {
              OR: [
                { created_at: { gt: cursorDate } },
                { created_at: cursorDate, id: { gt: cursorId } },
              ],
            }
          : { created_at: { gte: cursorDate } }),
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: limit + 1, // Fetch one extra to determine hasMore
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const changes = [];
    for (const row of items) {
      const hydrated = await this.hydrateChange(row, churchId, viewer!);
      if (hydrated) changes.push(hydrated);
    }

    // Store the LOW watermark of this page as the fallback cursor. Re-pulling
    // from it after a client crash re-delivers the whole page (idempotent
    // apply) instead of skipping an unapplied change.
    const fallbackCursor = items[0] ? new Date(items[0].created_at.getTime() - 1) : undefined;
    if (fallbackCursor) {
      await this.prisma.syncDevice.update({
        where: { id: device.id },
        data: { last_pull_cursor: fallbackCursor },
      });
    }

    const lastItem = items[items.length - 1];

    return {
      changes,
      hasMore,
      cursor: lastItem
        ? `v2:${Buffer.from(JSON.stringify({ date: lastItem.created_at.toISOString(), id: lastItem.id })).toString('base64url')}`
        : (cursor ?? cursorDate.toISOString()),
    };
  }

  /**
   * Returns a full snapshot of the church's core collections for a fresh
   * client bootstrap. The revision timestamp doubles as a pull cursor for
   * subsequent incremental syncs.
   */
  async bootstrap(
    churchId: string,
    viewer?: SyncViewer,
    limit = 100,
    entity?: string,
    cursor?: string,
  ): Promise<BootstrapResult> {
    this.requireViewer(churchId, viewer);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor && !isUUID(cursor)))
      throw new BadRequestException('Invalid bootstrap pagination');
    const entities = {
      member: 'members',
      service: 'services',
      givingCategory: 'givingCategories',
      visitor: 'visitors',
      attendance: 'attendance',
      transaction: 'transactions',
    } as const;
    if (entity && !(entity in entities))
      throw new BadRequestException('Unsupported bootstrap collection');
    if (cursor && !entity)
      throw new BadRequestException('Choose a collection when supplying a cursor');
    const collections: BootstrapResult['collections'] = {
      members: [],
      services: [],
      givingCategories: [],
      visitors: [],
      attendance: [],
      transactions: [],
    };
    const nextCursors: Record<string, string | null> = {};
    // Capture the delta watermark BEFORE reading, so concurrent writes are replayed.
    const revision = new Date().toISOString();
    for (const [name, collection] of Object.entries(entities)) {
      if ((entity && name !== entity) || !this.canRead(name, viewer!)) continue;
      const config = ENTITY_CONFIGS[name];
      const delegate = (this.prisma as unknown as Record<string, DelegateLike>)[config.delegate];
      const rows = await delegate.findMany({
        where: {
          ...this.readScope(name, churchId, viewer!),
          ...(cursor ? { id: { gt: cursor } } : {}),
          ...(['member', 'service', 'givingCategory', 'visitor'].includes(name)
            ? { archived_at: null }
            : {}),
          ...(name === 'visitor' ? { deleted_at: null } : {}),
        },
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      collections[collection as keyof BootstrapResult['collections']] = page.map(
        this.hydrateMappers[name],
      );
      nextCursors[name] = rows.length > limit ? String(page[page.length - 1].id) : null;
    }
    return { churchId, generatedAt: revision, revision, collections, nextCursors };
  }

  /**
   * Mark sync queue items as processed.
   */
  async markSynced(
    churchId: string,
    entityIds: string[],
    viewer?: SyncViewer,
  ): Promise<{ marked: number }> {
    this.requireViewer(churchId, viewer);
    if (!Array.isArray(entityIds) || entityIds.length > 100 || entityIds.some((id) => !isUUID(id)))
      throw new BadRequestException('Invalid sync IDs');
    // Acknowledgements must not suppress another device's work or future edits.
    // Retention is time-based; clients own their individual resume cursors.
    return { marked: 0 };
  }

  /**
   * Purges expired sync queue rows to bound table growth.
   *
   * Removes rows acknowledged by clients (synced) older than 30 days and any
   * row older than 90 days regardless of acknowledgement, so devices that
   * never come back online cannot accumulate rows forever. Clients that fall
   * beyond the retention window are expected to re-bootstrap.
   *
   * @param churchId - Church ID to scope the purge
   * @returns Number of rows deleted
   */
  async cleanupExpiredChanges(churchId: string): Promise<number> {
    const syncedCutoff = new Date();
    syncedCutoff.setDate(syncedCutoff.getDate() - 30);

    const hardCutoff = new Date();
    hardCutoff.setDate(hardCutoff.getDate() - 90);

    const result = await this.prisma.syncQueue.deleteMany({
      where: {
        church_id: churchId,
        OR: [
          { synced: true, synced_at: { lte: syncedCutoff } },
          { created_at: { lte: hardCutoff } },
        ],
      },
    });

    return result.count;
  }

  /**
   * Applies a single sync change to the real database table.
   *
   * create/update are applied via upsert (idempotent, last-write-wins) and
   * delete is scoped by both id and church_id to preserve tenant isolation.
   */
  private requireViewer(churchId: string, viewer?: SyncViewer): asserts viewer is SyncViewer {
    if (!viewer || viewer.church_id !== churchId || !viewer.permissions)
      throw new ForbiddenException('A verified sync scope is required');
  }

  private canRead(entity: string, viewer: SyncViewer) {
    if (entity === 'sermonBookmark')
      return !!viewer.member_id && viewer.permissions?.includes('sermons:list:read');
    return !!READ_PERMISSIONS[entity] && !!viewer.permissions?.includes(READ_PERMISSIONS[entity]);
  }

  private readScope(entity: string, churchId: string, viewer: SyncViewer): Record<string, unknown> {
    const where: Record<string, unknown> = { church_id: churchId };
    if (entity === 'sermonBookmark')
      where.member_id = viewer.member_id ?? '00000000-0000-0000-0000-000000000000';
    if (!viewer.is_admin_hq) {
      const branch = {
        church_id: churchId,
        branch_id: viewer.branch_id ?? '00000000-0000-0000-0000-000000000000',
      };
      if (entity === 'attendance') where.OR = [{ service: branch }, { event: branch }];
      else if (entity === 'lifeEvent') where.member = branch;
      else if (entity === 'sermonBookmark') where.sermon = branch;
      else if (entity === 'eventRegistration') where.event = branch;
      else where.branch_id = branch.branch_id;
    }
    return where;
  }

  private assertWritePermission(change: SyncChangeDto, viewer: SyncViewer) {
    // Payments, ticket allocation and check-ins must pass their normal domain APIs.
    const resources: Record<string, Record<string, string>> = {
      member: {
        create: 'members:new:create',
        update: 'members:all:update',
        delete: 'members:all:delete',
      },
      visitor: {
        create: 'visitors:new:create',
        update: 'visitors:list:update',
        delete: 'visitors:list:delete',
      },
      lifeEvent: {
        create: 'pastoral:life-events:create',
        update: 'pastoral:life-events:update',
        delete: 'pastoral:life-events:delete',
      },
      sermonBookmark: { create: 'sermons:list:read', delete: 'sermons:list:read' },
    };
    const permission = resources[change.entity]?.[change.action];
    if (!permission || !viewer.permissions?.includes(permission))
      throw new ForbiddenException('This sync operation is not permitted. Use the resource API.');
  }

  private async applyChange(
    tx: Prisma.TransactionClient,
    change: SyncChangeDto,
    churchId: string,
    viewer: SyncViewer,
  ): Promise<Record<string, unknown>> {
    const config = ENTITY_CONFIGS[change.entity];
    if (!config) throw new BadRequestException('Unsupported sync entity');
    const delegate = (tx as unknown as Record<string, DelegateLike>)[config.delegate];
    const existing = await delegate.findUnique({ where: { id: change.entityId } });
    const scope = { ...this.readScope(change.entity, churchId, viewer), id: change.entityId };
    if (existing && !(await delegate.findFirst({ where: scope })))
      throw new ForbiddenException('Record is outside your scope');
    if (change.action !== 'create' && !existing)
      throw new BadRequestException('Record does not exist');
    if (change.action === 'delete') {
      if (['member', 'visitor'].includes(change.entity))
        await delegate.updateMany({ where: scope, data: { archived_at: new Date() } });
      else await delegate.deleteMany({ where: scope });
      return existing!;
    }
    const data = { ...change.data };
    const dtoClass =
      change.entity === 'member'
        ? change.action === 'create'
          ? CreateMemberDto
          : UpdateMemberDto
        : change.entity === 'visitor'
          ? change.action === 'create'
            ? CreateVisitorDto
            : UpdateVisitorDto
          : CreateLifeEventDto;
    if (change.entity !== 'sermonBookmark') {
      // Branch assignment is verified separately; derived/server fields stay immutable.
      const validated = { ...data };
      if (change.entity === 'visitor') delete validated.branchId;
      await validateOrReject(plainToInstance(dtoClass as new () => object, validated), {
        whitelist: true,
        forbidNonWhitelisted: true,
        skipMissingProperties: change.action === 'update',
      });
    }
    const mapped = this.mapData(config, data);
    if (['member', 'visitor'].includes(change.entity)) {
      const branchId = viewer.is_admin_hq
        ? (data.branchId ?? existing?.branch_id ?? viewer.branch_id)
        : viewer.branch_id;
      if (!viewer.is_admin_hq && data.branchId && data.branchId !== viewer.branch_id)
        throw new ForbiddenException('Branch is outside your scope');
      if (
        !branchId ||
        !(await tx.branch.findFirst({ where: { id: String(branchId), church_id: churchId } }))
      )
        throw new BadRequestException('A valid church branch is required');
      mapped.branch_id = branchId;
    }
    const relations: Record<string, string> = {
      memberId: 'member',
      assignedToId: 'profile',
      convertedMemberId: 'member',
      sermonId: 'sermon',
    };
    for (const [field, table] of Object.entries(relations)) {
      if (!data[field]) continue;
      if (typeof data[field] !== 'string' || !isUUID(data[field] as string))
        throw new BadRequestException('Invalid related record');
      const related = (tx as unknown as Record<string, DelegateLike>)[table];
      const where: Record<string, unknown> = { id: data[field], church_id: churchId };
      if (!viewer.is_admin_hq)
        where.branch_id = viewer.branch_id ?? '00000000-0000-0000-0000-000000000000';
      if (!(await related.findFirst({ where })))
        throw new ForbiddenException('Related record is outside your scope');
    }
    if (change.entity === 'sermonBookmark') {
      if (
        !viewer.member_id ||
        data.memberId !== viewer.member_id ||
        Object.keys(data).some((key) => !['memberId', 'sermonId'].includes(key))
      )
        throw new ForbiddenException('Only your own bookmarks can be changed');
    }
    const scoped = { ...mapped, church_id: churchId };
    if (existing) {
      if (change.action === 'create')
        throw new BadRequestException(
          'Record already exists; send an update with a new mutation ID',
        );
      const result = await delegate.updateMany({ where: scope, data: scoped });
      if (result.count !== 1) throw new ForbiddenException('Record scope changed');
    } else await delegate.create({ data: { ...scoped, id: change.entityId } });
    return { ...existing, ...scoped, id: change.entityId };
  }

  private mapData(
    config: EntityFieldConfig,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    for (const [camel, snake] of Object.entries(config.fields)) {
      const value = data[camel];
      if (value === undefined || value === null) {
        continue;
      }
      mapped[snake] =
        config.dates.includes(camel) && typeof value === 'string' ? new Date(value) : value;
    }

    return mapped;
  }

  /**
   * Hydrates a single sync queue row to its live camelCase state.
   *
   * create/update rows are resolved against the current database row so the
   * client always receives the authoritative latest state (even when several
   * updates landed in the queue). delete rows and rows whose record has since
   * been removed become tombstones (data: null) so clients can drop them.
   */
  private async hydrateChange(
    row: {
      entity: string;
      entity_id: string;
      action: string;
      data: Prisma.JsonValue;
      created_at: Date;
    },
    churchId: string,
    viewer: SyncViewer,
  ): Promise<PullResult['changes'][number] | null> {
    if (!this.canRead(row.entity, viewer)) return null;
    const config = ENTITY_CONFIGS[row.entity];
    if (!config) return null;
    const base = {
      entity: row.entity,
      entityId: row.entity_id,
      action: row.action,
      createdAt: row.created_at.toISOString(),
    };

    if (row.action === 'delete') {
      const old = (
        row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {}
      ) as Record<string, unknown>;
      if (row.entity === 'sermonBookmark' && (old.member_id ?? old.memberId) !== viewer.member_id)
        return null;
      if (!viewer.is_admin_hq) {
        const branchId = old.branch_id ?? old.branchId;
        if (!viewer.branch_id) return null;
        if (row.entity === 'sermonBookmark' && (old.member_id ?? old.memberId) !== viewer.member_id)
          return null;
        if (branchId !== viewer.branch_id) {
          const parents: Array<[string, unknown]> =
            row.entity === 'attendance'
              ? [
                  ['service', old.service_id ?? old.serviceId],
                  ['event', old.event_id ?? old.eventId],
                ]
              : row.entity === 'lifeEvent'
                ? [['member', old.member_id ?? old.memberId]]
                : row.entity === 'eventRegistration'
                  ? [['event', old.event_id ?? old.eventId]]
                  : row.entity === 'sermonBookmark'
                    ? [['sermon', old.sermon_id ?? old.sermonId]]
                    : [];
          let visible = false;
          for (const [table, parentId] of parents) {
            if (typeof parentId !== 'string' || !isUUID(parentId)) continue;
            const delegate = (this.prisma as unknown as Record<string, DelegateLike>)[table];
            if (
              await delegate.findFirst({
                where: { id: parentId, church_id: churchId, branch_id: viewer.branch_id },
              })
            ) {
              visible = true;
              break;
            }
          }
          if (!visible) return null;
        }
      }
      return { ...base, data: null };
    }

    const mapper = this.hydrateMappers[row.entity];
    if (!mapper) {
      return { ...base, data: (row.data as Record<string, unknown>) || null };
    }

    const delegate = (this.prisma as unknown as Record<string, DelegateLike>)[config.delegate];

    const record = await delegate.findFirst({
      where: { ...this.readScope(row.entity, churchId, viewer), id: row.entity_id },
    });
    if (!record) return null;

    // Archived records are delivered as tombstones so connected clients drop
    // them locally. The server-side archive/restore endpoints emit outbox rows
    // via the DB triggers on UPDATE, so restore re-delivers the live row.
    if (record.archived_at) {
      return { ...base, data: null };
    }

    return { ...base, data: mapper(record) };
  }

  private readonly hydrateMappers: Record<
    string,
    (record: Record<string, unknown>) => Record<string, unknown>
  > = {
    member: (r) => this.mapMember(r as Parameters<typeof this.mapMember>[0]),
    service: (r) => this.mapService(r as Parameters<typeof this.mapService>[0]),
    givingCategory: (r) =>
      this.mapGivingCategory(r as Parameters<typeof this.mapGivingCategory>[0]),
    visitor: (r) => this.mapVisitor(r as Parameters<typeof this.mapVisitor>[0]),
    attendance: (r) => this.mapAttendance(r as Parameters<typeof this.mapAttendance>[0]),
    transaction: (r) => this.mapTransaction(r as Parameters<typeof this.mapTransaction>[0]),
    lifeEvent: (r) => this.mapLifeEvent(r as Parameters<typeof this.mapLifeEvent>[0]),
    sermonBookmark: (r) =>
      this.mapSermonBookmark(r as Parameters<typeof this.mapSermonBookmark>[0]),
    eventRegistration: (r) =>
      this.mapEventRegistration(r as Parameters<typeof this.mapEventRegistration>[0]),
  };

  private mapLifeEvent(e: {
    id: string;
    church_id: string;
    member_id: string;
    type: string;
    date: Date;
    details: Prisma.JsonValue;
    notified: boolean;
    created_at: Date;
  }): Record<string, unknown> {
    return {
      id: e.id,
      churchId: e.church_id,
      memberId: e.member_id,
      type: e.type,
      date: e.date.toISOString(),
      details: e.details,
      notified: e.notified,
      createdAt: e.created_at.toISOString(),
    };
  }

  private mapSermonBookmark(b: {
    id: string;
    church_id: string;
    member_id: string;
    sermon_id: string;
    created_at: Date;
  }): Record<string, unknown> {
    return {
      id: b.id,
      churchId: b.church_id,
      memberId: b.member_id,
      sermonId: b.sermon_id,
      createdAt: b.created_at.toISOString(),
    };
  }

  private mapEventRegistration(r: {
    id: string;
    church_id: string;
    event_id: string;
    member_id: string;
    custom_data: Prisma.JsonValue;
    payment_status: string;
    payment_reference: string | null;
    transaction_id: string | null;
    ticket_id: string | null;
    tier_id: string | null;
    quantity: number;
    checked_in: boolean;
    checked_in_at: Date | null;
    created_at: Date;
  }): Record<string, unknown> {
    return {
      id: r.id,
      churchId: r.church_id,
      eventId: r.event_id,
      memberId: r.member_id,
      customData: r.custom_data,
      paymentStatus: r.payment_status,
      paymentReference: r.payment_reference,
      transactionId: r.transaction_id,
      ticketId: r.ticket_id,
      tierId: r.tier_id,
      quantity: r.quantity,
      checkedIn: r.checked_in,
      checkedInAt: r.checked_in_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    };
  }

  private mapMember(m: {
    id: string;
    church_id: string;
    branch_id: string | null;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    date_of_birth: Date | null;
    gender: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    status: string;
    member_since: Date;
    photo_url: string | null;
    custom_fields: Prisma.JsonValue;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }): Record<string, unknown> {
    return {
      id: m.id,
      churchId: m.church_id,
      branchId: m.branch_id,
      firstName: m.first_name,
      lastName: m.last_name,
      email: m.email,
      phone: m.phone,
      whatsappNumber: m.whatsapp_number,
      dateOfBirth: m.date_of_birth?.toISOString() ?? null,
      gender: m.gender,
      address: m.address,
      city: m.city,
      state: m.state,
      status: m.status,
      memberSince: m.member_since.toISOString(),
      photoUrl: m.photo_url,
      customFields: m.custom_fields,
      notes: m.notes,
      createdAt: m.created_at.toISOString(),
      updatedAt: m.updated_at.toISOString(),
    };
  }

  private mapService(s: {
    id: string;
    church_id: string;
    branch_id: string | null;
    name: string;
    day_of_week: number | null;
    start_time: Date | null;
    end_time: Date | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): Record<string, unknown> {
    return {
      id: s.id,
      churchId: s.church_id,
      branchId: s.branch_id,
      name: s.name,
      dayOfWeek: s.day_of_week,
      startTime: s.start_time?.toISOString() ?? null,
      endTime: s.end_time?.toISOString() ?? null,
      isActive: s.is_active,
      createdAt: s.created_at.toISOString(),
      updatedAt: s.updated_at.toISOString(),
    };
  }

  private mapGivingCategory(c: {
    id: string;
    church_id: string;
    name: string;
    description: string | null;
    display_order: number;
    is_recurring: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): Record<string, unknown> {
    return {
      id: c.id,
      churchId: c.church_id,
      name: c.name,
      description: c.description,
      displayOrder: c.display_order,
      isRecurring: c.is_recurring,
      isActive: c.is_active,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
    };
  }

  private mapVisitor(v: {
    id: string;
    church_id: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    email: string | null;
    first_visit_date: Date;
    follow_up_status: string;
    assigned_to_id: string | null;
    notes: string | null;
    converted_member_id: string | null;
    converted_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }): Record<string, unknown> {
    return {
      id: v.id,
      churchId: v.church_id,
      firstName: v.first_name,
      lastName: v.last_name,
      phone: v.phone,
      whatsappNumber: v.whatsapp_number,
      email: v.email,
      firstVisitDate: v.first_visit_date.toISOString(),
      followUpStatus: v.follow_up_status,
      assignedToId: v.assigned_to_id,
      notes: v.notes,
      convertedMemberId: v.converted_member_id,
      convertedAt: v.converted_at?.toISOString() ?? null,
      createdAt: v.created_at.toISOString(),
      updatedAt: v.updated_at.toISOString(),
    };
  }

  private mapAttendance(a: {
    id: string;
    church_id: string;
    service_id: string | null;
    event_id: string | null;
    member_id: string | null;
    visitor_name: string | null;
    checkin_at: Date;
    source: string;
    created_at: Date;
  }): Record<string, unknown> {
    return {
      id: a.id,
      churchId: a.church_id,
      serviceId: a.service_id,
      eventId: a.event_id,
      memberId: a.member_id,
      visitorName: a.visitor_name,
      checkinAt: a.checkin_at.toISOString(),
      source: a.source,
      createdAt: a.created_at.toISOString(),
    };
  }

  private mapTransaction(t: {
    id: string;
    church_id: string;
    branch_id: string | null;
    member_id: string | null;
    category_id: string | null;
    amount: number;
    currency: string;
    type: string;
    status: string;
    payment_reference: string | null;
    payment_gateway: string;
    payment_method: string | null;
    receipt_number: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }): Record<string, unknown> {
    return {
      id: t.id,
      churchId: t.church_id,
      branchId: t.branch_id,
      memberId: t.member_id,
      categoryId: t.category_id,
      amount: t.amount,
      currency: t.currency,
      type: t.type,
      status: t.status,
      paymentReference: t.payment_reference,
      paymentGateway: t.payment_gateway,
      paymentMethod: t.payment_method,
      receiptNumber: t.receipt_number,
      notes: t.notes,
      createdAt: t.created_at.toISOString(),
      updatedAt: t.updated_at.toISOString(),
    };
  }
}
