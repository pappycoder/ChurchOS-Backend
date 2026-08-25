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

const ENTITY_CONFIGS: Record<string, EntityFieldConfig> = {
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

        // Apply the change to the real tables and record it in the outbox
        // atomically so propagation never diverges from the source of truth.
        // The session GUC suppresses the sync_outbox trigger during the apply
        // so device-originated changes are recorded exactly once here.
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.sync_outbox.skip', 'true', true)`;
          await this.applyChange(tx, change, churchId);
          await tx.syncQueue.create({
            data: {
              church_id: churchId,
              entity: change.entity,
              entity_id: change.entityId,
              action: change.action,
              data: (change.data || {}) as Prisma.InputJsonValue,
            },
          });
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
  ): Promise<PullResult> {
    const device = await this.prisma.syncDevice.upsert({
      where: { church_id_device_id: { church_id: churchId, device_id: deviceId } },
      create: { church_id: churchId, device_id: deviceId },
      update: { last_seen_at: new Date() },
    });

    const cursorDate = cursor ? new Date(cursor) : (device.last_pull_cursor ?? new Date(0));

    if (Number.isNaN(cursorDate.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    const rows = await this.prisma.syncQueue.findMany({
      where: {
        church_id: churchId,
        created_at: { gt: cursorDate },
      },
      orderBy: { created_at: 'asc' },
      take: limit + 1, // Fetch one extra to determine hasMore
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const changes = [];
    for (const row of items) {
      changes.push(await this.hydrateChange(row));
    }

    // Store the LOW watermark of this page as the fallback cursor. Re-pulling
    // from it after a client crash re-delivers the whole page (idempotent
    // apply) instead of skipping an unapplied change.
    const fallbackCursor = items[0]?.created_at;
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
      cursor: lastItem ? lastItem.created_at.toISOString() : cursorDate.toISOString(),
    };
  }

  /**
   * Returns a full snapshot of the church's core collections for a fresh
   * client bootstrap. The revision timestamp doubles as a pull cursor for
   * subsequent incremental syncs.
   */
  async bootstrap(churchId: string): Promise<BootstrapResult> {
    const [members, services, givingCategories, visitors, attendance, transactions] =
      await Promise.all([
        this.prisma.member.findMany({ where: { church_id: churchId } }),
        this.prisma.service.findMany({ where: { church_id: churchId } }),
        this.prisma.givingCategory.findMany({ where: { church_id: churchId } }),
        this.prisma.visitor.findMany({ where: { church_id: churchId } }),
        this.prisma.attendance.findMany({ where: { church_id: churchId } }),
        this.prisma.transaction.findMany({ where: { church_id: churchId } }),
      ]);

    const revision = new Date();

    return {
      churchId,
      generatedAt: revision.toISOString(),
      revision: revision.toISOString(),
      collections: {
        members: members.map((m) => this.mapMember(m)),
        services: services.map((s) => this.mapService(s)),
        givingCategories: givingCategories.map((c) => this.mapGivingCategory(c)),
        visitors: visitors.map((v) => this.mapVisitor(v)),
        attendance: attendance.map((a) => this.mapAttendance(a)),
        transactions: transactions.map((t) => this.mapTransaction(t)),
      },
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
  private async applyChange(
    tx: Prisma.TransactionClient,
    change: SyncChangeDto,
    churchId: string,
  ): Promise<void> {
    const config = ENTITY_CONFIGS[change.entity];

    if (!config) {
      throw new BadRequestException(`Unsupported sync entity: ${change.entity}`);
    }

    const delegate = (tx as unknown as Record<string, DelegateLike>)[config.delegate];

    if (change.action === 'delete') {
      await delegate.deleteMany({
        where: { id: change.entityId, church_id: churchId },
      });
      return;
    }

    if (change.action !== 'create' && change.action !== 'update') {
      throw new BadRequestException(`Unsupported sync action: ${change.action}`);
    }

    const data = this.mapData(config, change.data);

    // Ensure the tenant scope can never be overwritten by client payloads
    const scopedData = { ...data, church_id: churchId };

    await delegate.upsert({
      where: { id: change.entityId },
      create: { ...scopedData, id: change.entityId },
      update: scopedData,
    });
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
  private async hydrateChange(row: {
    entity: string;
    entity_id: string;
    action: string;
    data: Prisma.JsonValue;
    created_at: Date;
  }): Promise<PullResult['changes'][number]> {
    const base = {
      entity: row.entity,
      entityId: row.entity_id,
      action: row.action,
      createdAt: row.created_at.toISOString(),
    };

    if (row.action === 'delete') {
      return { ...base, data: null };
    }

    const mapper = this.hydrateMappers[row.entity];
    if (!mapper) {
      return { ...base, data: (row.data as Record<string, unknown>) || null };
    }

    const config = ENTITY_CONFIGS[row.entity];
    const delegate = (this.prisma as unknown as Record<string, DelegateLike>)[config.delegate];

    const record = await delegate.findUnique({ where: { id: row.entity_id } });
    if (!record) {
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
