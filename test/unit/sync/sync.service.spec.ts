/**
 * @file sync.service.spec.ts
 * @description Unit tests for SyncService.
 */

import { SyncService } from '../../../src/sync/sync.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';

function createPrismaMock() {
  const models: Record<string, Record<string, jest.Mock>> = {};

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === '$transaction') return $transaction;
      if (prop === '$queryRaw') return jest.fn().mockResolvedValue([]);
      if (!models[prop]) {
        models[prop] = {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          delete: jest.fn(),
          count: jest.fn(),
          aggregate: jest.fn(),
          groupBy: jest.fn(),
          upsert: jest.fn(),
          deleteMany: jest.fn(),
        };
      }
      return models[prop];
    },
  };

  const txHandler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      return models[prop];
    },
  };

  const $transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = new Proxy({} as Record<string, unknown>, txHandler);
      return fn(tx);
    });

  return new Proxy({ $transaction } as Record<string, unknown>, handler) as Record<
    string,
    unknown
  > & { $transaction: jest.Mock };
}

function model(name: string): Record<string, jest.Mock> {
  return prisma[name] as Record<string, jest.Mock>;
}

let prisma: ReturnType<typeof createPrismaMock>;
let audit: { log: jest.Mock };
let service: SyncService;

const mockChurchId = '00000000-0000-0000-0000-000000000001';
const mockUserId = '11111111-1111-1111-1111-111111111111';
const mockMemberId = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  prisma = createPrismaMock();
  audit = { log: jest.fn().mockResolvedValue(undefined) };

  service = new SyncService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditLoggingService,
  );
});

describe('SyncService', () => {
  describe('pushChanges', () => {
    it('should push changes successfully and apply them to the database', async () => {
      model('syncQueue').findFirst.mockResolvedValue(null); // no existing / pending
      model('member').upsert.mockResolvedValue({ id: mockMemberId });
      model('syncQueue').create.mockResolvedValue({ id: '1' });

      const result = await service.pushChanges(mockChurchId, mockUserId, [
        {
          entity: 'member',
          entityId: mockMemberId,
          action: 'create',
          data: { firstName: 'John', lastName: 'Doe' },
        },
      ]);

      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(0);
      expect(result.conflicts).toHaveLength(0);
      expect(model('member').upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockMemberId },
          create: expect.objectContaining({
            id: mockMemberId,
            first_name: 'John',
            last_name: 'Doe',
            church_id: mockChurchId,
          }),
        }),
      );
      expect(model('syncQueue').create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            church_id: mockChurchId,
            entity: 'member',
            entity_id: mockMemberId,
          }),
        }),
      );
    });

    it('should skip already-synced changes (idempotency)', async () => {
      model('syncQueue').findFirst.mockResolvedValue({ id: 'existing', synced: true });

      const result = await service.pushChanges(mockChurchId, mockUserId, [
        {
          entity: 'member',
          entityId: mockMemberId,
          action: 'create',
          data: { firstName: 'John' },
        },
      ]);

      expect(result.accepted).toBe(1);
      expect(model('syncQueue').create).not.toHaveBeenCalled();
      expect(model('member').upsert).not.toHaveBeenCalled();
    });

    it('should reject older client timestamps (conflict)', async () => {
      // Pending change with a newer timestamp
      model('syncQueue')
        .findFirst.mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce({
          id: 'pending',
          created_at: new Date('2026-07-22T12:00:00Z'),
        }); // conflict check

      const result = await service.pushChanges(mockChurchId, mockUserId, [
        {
          entity: 'member',
          entityId: mockMemberId,
          action: 'create',
          data: { firstName: 'John' },
          clientTimestamp: '2026-07-22T11:00:00Z', // older
        },
      ]);

      expect(result.rejected).toBe(1);
      expect(result.conflicts).toContain(`member/${mockMemberId}`);
      expect(model('member').upsert).not.toHaveBeenCalled();
    });

    it('should reject changes for unsupported entities', async () => {
      model('syncQueue').findFirst.mockResolvedValue(null);

      const result = await service.pushChanges(mockChurchId, mockUserId, [
        {
          entity: 'alienSaucer',
          entityId: mockMemberId,
          action: 'create',
          data: {},
        },
      ]);

      expect(result.rejected).toBe(1);
    });

    it('should apply deletes scoped by church', async () => {
      model('syncQueue').findFirst.mockResolvedValue(null);
      model('member').deleteMany.mockResolvedValue({ count: 1 });
      model('syncQueue').create.mockResolvedValue({ id: '1' });

      const result = await service.pushChanges(mockChurchId, mockUserId, [
        {
          entity: 'member',
          entityId: mockMemberId,
          action: 'delete',
          data: {},
        },
      ]);

      expect(result.accepted).toBe(1);
      expect(model('member').deleteMany).toHaveBeenCalledWith({
        where: { id: mockMemberId, church_id: mockChurchId },
      });
    });

    it('should throw BadRequestException for empty changes', async () => {
      await expect(service.pushChanges(mockChurchId, mockUserId, [])).rejects.toThrow(
        'No changes provided',
      );
    });
  });

  describe('pullChanges', () => {
    it('should return pending changes', async () => {
      model('syncQueue').findMany.mockResolvedValue([
        {
          entity: 'member',
          entity_id: mockMemberId,
          action: 'create',
          data: { firstName: 'John' },
          created_at: new Date('2026-07-22T10:00:00Z'),
        },
      ]);

      const result = await service.pullChanges(mockChurchId);

      expect(result.changes).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.changes[0].entity).toBe('member');
    });

    it('should detect hasMore when limit exceeded', async () => {
      // Return 11 items when limit is 10
      const items = Array.from({ length: 11 }, (_, i) => ({
        entity: 'member',
        entity_id: `id-${i}`,
        action: 'update',
        data: {},
        created_at: new Date(),
      }));
      model('syncQueue').findMany.mockResolvedValue(items);

      const result = await service.pullChanges(mockChurchId, 10);

      expect(result.hasMore).toBe(true);
      expect(result.changes).toHaveLength(10);
    });
  });

  describe('bootstrap', () => {
    it('should return a full snapshot with camelCase collections', async () => {
      const member = {
        id: mockMemberId,
        church_id: mockChurchId,
        branch_id: null,
        first_name: 'John',
        last_name: 'Doe',
        email: null,
        phone: '+2348012345678',
        whatsapp_number: null,
        date_of_birth: null,
        gender: 'male',
        address: null,
        city: null,
        state: null,
        status: 'active',
        member_since: new Date('2026-01-01T10:00:00Z'),
        photo_url: null,
        custom_fields: {},
        notes: null,
        created_at: new Date('2026-01-01T10:00:00Z'),
        updated_at: new Date('2026-01-01T10:00:00Z'),
      };

      model('member').findMany.mockResolvedValue([member]);
      model('service').findMany.mockResolvedValue([]);
      model('givingCategory').findMany.mockResolvedValue([]);
      model('visitor').findMany.mockResolvedValue([]);
      model('attendance').findMany.mockResolvedValue([]);
      model('transaction').findMany.mockResolvedValue([]);

      const result = await service.bootstrap(mockChurchId);

      expect(result.churchId).toBe(mockChurchId);
      expect(typeof result.revision).toBe('string');
      expect(result.collections.members).toHaveLength(1);
      expect(result.collections.members[0]).toMatchObject({
        id: mockMemberId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+2348012345678',
        memberSince: '2026-01-01T10:00:00.000Z',
      });
      expect(result.collections.services).toEqual([]);
    });
  });

  describe('markSynced', () => {
    it('should mark entities as synced', async () => {
      model('syncQueue').updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markSynced(mockChurchId, ['id-1', 'id-2', 'id-3']);

      expect(result.marked).toBe(3);
    });
  });
});
