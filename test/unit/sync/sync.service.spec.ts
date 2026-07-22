/**
 * @file sync.service.spec.ts
 * @description Unit tests for SyncService.
 */

import { SyncService } from '../../../src/sync/sync.service';

function createPrismaMock() {
  const models: Record<string, Record<string, jest.Mock>> = {};
  const $transactionMock = jest.fn();
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === '$transaction') return $transactionMock;
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
        };
      }
      return models[prop];
    },
  };
  return new Proxy({ $transaction: $transactionMock } as Record<string, unknown>, handler) as Record<
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

beforeEach(() => {
  prisma = createPrismaMock();
  audit = { log: jest.fn().mockResolvedValue(undefined) };

  service = new SyncService(
    prisma as unknown as import('../../../src/prisma/prisma.service').PrismaService,
    audit as unknown as import('../../../src/common/services/audit-logging.service').AuditLoggingService,
  );
});

describe('SyncService', () => {
  describe('pushChanges', () => {
    it('should push changes successfully', async () => {
      model('syncQueue').findFirst.mockResolvedValue(null); // no existing
      model('syncQueue').create.mockResolvedValue({ id: '1' });

      const result = await service.pushChanges(mockChurchId, mockUserId, [
        {
          entity: 'member',
          entityId: '44444444-4444-4444-4444-444444444444',
          action: 'create',
          data: { firstName: 'John', lastName: 'Doe' },
        },
      ]);

      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should skip already-synced changes (idempotency)', async () => {
      model('syncQueue').findFirst.mockResolvedValue({ id: 'existing', synced: true });

      const result = await service.pushChanges(mockChurchId, mockUserId, [
        {
          entity: 'member',
          entityId: '44444444-4444-4444-4444-444444444444',
          action: 'create',
          data: { firstName: 'John' },
        },
      ]);

      expect(result.accepted).toBe(1);
      expect(model('syncQueue').create).not.toHaveBeenCalled();
    });

    it('should reject older client timestamps (conflict)', async () => {
      // Pending change with a newer timestamp
      model('syncQueue').findFirst
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce({
          id: 'pending',
          created_at: new Date('2026-07-22T12:00:00Z'),
        }); // conflict check

      const result = await service.pushChanges(mockChurchId, mockUserId, [
        {
          entity: 'member',
          entityId: '44444444-4444-4444-4444-444444444444',
          action: 'create',
          data: { firstName: 'John' },
          clientTimestamp: '2026-07-22T11:00:00Z', // older
        },
      ]);

      expect(result.rejected).toBe(1);
      expect(result.conflicts).toContain('member/44444444-4444-4444-4444-444444444444');
    });

    it('should throw BadRequestException for empty changes', async () => {
      await expect(
        service.pushChanges(mockChurchId, mockUserId, []),
      ).rejects.toThrow('No changes provided');
    });
  });

  describe('pullChanges', () => {
    it('should return pending changes', async () => {
      model('syncQueue').findMany.mockResolvedValue([
        {
          entity: 'member',
          entity_id: '44444444-4444-4444-4444-444444444444',
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

  describe('markSynced', () => {
    it('should mark entities as synced', async () => {
      model('syncQueue').updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markSynced(mockChurchId, ['id-1', 'id-2', 'id-3']);

      expect(result.marked).toBe(3);
    });
  });
});
