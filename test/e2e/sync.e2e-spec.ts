/**
 * @file sync.e2e-spec.ts
 * @description End-to-end tests for SyncService (pull hydration, watermark
 * cursor, tombstones, push apply + outbox suppression, cleanup) against a
 * real PostgreSQL database.
 */

import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../src/common/services/audit-logging.service';
import { SyncService } from '../../src/sync/sync.service';

describe('SyncService (e2e)', () => {
  let prisma: PrismaService;
  let service: SyncService;

  const churchId = randomUUID();
  const memberId = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, AuditLoggingService, SyncService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(SyncService);
    await prisma.$connect();

    await prisma.church.create({
      data: { id: churchId, name: 'e2e-sync-church' },
    });
  });

  afterAll(async () => {
    await prisma.syncQueue.deleteMany({ where: { church_id: churchId } });
    await prisma.syncDevice.deleteMany({ where: { church_id: churchId } });
    await prisma.auditLog.deleteMany({ where: { church_id: churchId } });
    await prisma.member.deleteMany({ where: { church_id: churchId } });
    await prisma.auditLog.deleteMany({ where: { church_id: churchId } });
    await prisma.syncQueue.deleteMany({ where: { church_id: churchId } });
    await prisma.church.deleteMany({ where: { id: churchId } });
    await prisma.$disconnect();
  });

  it('bootstraps a full camelCase snapshot', async () => {
    const result = await service.bootstrap(churchId);

    expect(result.churchId).toBe(churchId);
    expect(typeof result.revision).toBe('string');
    expect(result.collections.members).toEqual([]);
    expect(result.collections.services).toEqual([]);
  });

  it('hydrates DB-triggered changes into live camelCase state', async () => {
    await prisma.member.create({
      data: {
        id: memberId,
        church_id: churchId,
        first_name: 'Ada',
        last_name: 'Obi',
        status: 'active',
        member_since: new Date(),
      },
    });

    const first = await service.pullChanges(churchId, 'web');
    expect(first.changes.length).toBeGreaterThanOrEqual(1);

    const memberChange = first.changes.find((c) => c.entityId === memberId);
    expect(memberChange).toBeDefined();
    expect(memberChange!.action).toBe('create');
    expect(memberChange!.data).toMatchObject({
      id: memberId,
      churchId,
      firstName: 'Ada',
      lastName: 'Obi',
    });
    expect(typeof first.cursor).toBe('string');
  });

  it('returns tombstones for deleted records and advances the watermark', async () => {
    const before = await service.pullChanges(churchId, 'web');

    await prisma.member.delete({ where: { id: memberId } });

    const after = await service.pullChanges(churchId, 'web', 100, before.cursor ?? undefined);
    expect(after.changes.length).toBeGreaterThanOrEqual(1);

    const deleteChange = after.changes.find(
      (c) => c.entityId === memberId && c.action === 'delete',
    );
    expect(deleteChange).toBeDefined();
    expect(deleteChange!.data).toBeNull();
  });

  it('applies pushed changes and suppresses duplicate outbox rows', async () => {
    const pushedMemberId = randomUUID();
    const result = await service.pushChanges(churchId, randomUUID(), [
      {
        entity: 'member',
        entityId: pushedMemberId,
        action: 'create',
        data: { firstName: 'Kelechi', lastName: 'Nwosu' },
      },
    ]);

    expect(result.accepted).toBe(1);

    const row = await prisma.member.findUnique({ where: { id: pushedMemberId } });
    expect(row).not.toBeNull();
    expect(row!.first_name).toBe('Kelechi');

    // Exactly one queue row: the explicit outbox insert, not a trigger duplicate.
    const queueCount = await prisma.syncQueue.count({
      where: { church_id: churchId, entity_id: pushedMemberId },
    });
    expect(queueCount).toBe(1);
  });

  it('applies pushed deletes scoped by church', async () => {
    const pushedMemberId = randomUUID();
    await prisma.member.create({
      data: {
        id: pushedMemberId,
        church_id: churchId,
        first_name: 'Delete',
        last_name: 'Me',
        status: 'active',
        member_since: new Date(),
      },
    });

    const result = await service.pushChanges(churchId, randomUUID(), [
      { entity: 'member', entityId: pushedMemberId, action: 'delete', data: {} },
    ]);

    expect(result.accepted).toBe(1);
    expect(await prisma.member.findUnique({ where: { id: pushedMemberId } })).toBeNull();
  });

  it('purges expired and synced queue rows during cleanup', async () => {
    await prisma.member.create({
      data: {
        id: randomUUID(),
        church_id: churchId,
        first_name: 'Expired',
        last_name: 'Row',
        status: 'active',
        member_since: new Date(),
      },
    });

    await prisma.syncQueue.updateMany({
      where: { church_id: churchId, synced: false },
      data: { synced: true },
    });

    const old = new Date();
    old.setDate(old.getDate() - 45);
    await prisma.syncQueue.updateMany({
      where: { church_id: churchId },
      data: { created_at: old, synced_at: old },
    });

    const purged = await service.cleanupExpiredChanges(churchId);
    expect(purged).toBeGreaterThan(0);
    expect(await prisma.syncQueue.count({ where: { church_id: churchId } })).toBe(0);
  });
});
