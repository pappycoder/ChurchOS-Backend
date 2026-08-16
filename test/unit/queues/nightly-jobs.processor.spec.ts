/**
 * @file nightly-jobs.processor.spec.ts
 * @description Unit tests for NightlyJobsProcessor.
 *
 * @module test/unit/queues/nightly-jobs.processor.spec
 */

import { NightlyJobsProcessor } from '../../../src/queues/processors/nightly-jobs.processor';
import { ScoringService } from '../../../src/pastoral/scoring.service';
import { PastoralService } from '../../../src/pastoral/pastoral.service';
import { WhatsAppService } from '../../../src/whatsapp/whatsapp.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SyncService } from '../../../src/sync/sync.service';
import { Queue } from 'bullmq';

function createPrismaMock() {
  const models: Record<string, Record<string, jest.Mock>> = {};

  function ensureModel(prop: string): Record<string, jest.Mock> {
    if (!models[prop]) {
      models[prop] = {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };
    }
    return models[prop];
  }

  const txHandler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      return ensureModel(prop);
    },
  };

  const $transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(new Proxy({} as Record<string, unknown>, txHandler));
    });

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === '$transaction') return $transaction;
      return ensureModel(prop);
    },
  };

  return new Proxy({ $transaction } as Record<string, unknown>, handler) as Record<
    string,
    unknown
  > & { $transaction: jest.Mock };
}

function model(name: string): Record<string, jest.Mock> {
  return prisma[name] as Record<string, jest.Mock>;
}

const mockChurchId = '00000000-0000-0000-0000-000000000001';

let prisma: ReturnType<typeof createPrismaMock>;
let scoringService: {
  calculateEngagementScores: jest.Mock;
  calculateRiskScores: jest.Mock;
  getMembersNeedingAttention: jest.Mock;
};
let pastoralService: { getUpcomingLifeEvents: jest.Mock; markLifeEventNotified: jest.Mock };
let whatsappService: { sendMessage: jest.Mock };
let syncService: { cleanupExpiredChanges: jest.Mock };
let recurringQueue: { add: jest.Mock };
let processor: NightlyJobsProcessor;

function makeJob() {
  return {
    id: 'job-1',
    data: { churchId: mockChurchId },
    updateProgress: jest.fn(),
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as never;
}

beforeEach(() => {
  prisma = createPrismaMock();
  scoringService = {
    calculateEngagementScores: jest.fn().mockResolvedValue(10),
    calculateRiskScores: jest.fn().mockResolvedValue(5),
    getMembersNeedingAttention: jest.fn().mockResolvedValue([{}, {}]),
  };
  pastoralService = {
    getUpcomingLifeEvents: jest.fn().mockResolvedValue([]),
    markLifeEventNotified: jest.fn().mockResolvedValue(undefined),
  };
  whatsappService = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  syncService = { cleanupExpiredChanges: jest.fn().mockResolvedValue(3) };
  recurringQueue = { add: jest.fn().mockResolvedValue(undefined) };

  model('recurringGiving').findMany.mockResolvedValue([]);
  model('member').findMany.mockResolvedValue([]);
  model('auditLog').deleteMany.mockResolvedValue({ count: 0 });

  processor = new NightlyJobsProcessor(
    scoringService as unknown as ScoringService,
    pastoralService as unknown as PastoralService,
    whatsappService as unknown as WhatsAppService,
    prisma as unknown as PrismaService,
    syncService as unknown as SyncService,
    recurringQueue as unknown as Queue,
  );
});

describe('NightlyJobsProcessor', () => {
  describe('process', () => {
    it('should run all nightly tasks and return a full result summary', async () => {
      const result = await processor.process(makeJob());

      expect(scoringService.calculateEngagementScores).toHaveBeenCalledWith(mockChurchId);
      expect(scoringService.calculateRiskScores).toHaveBeenCalledWith(mockChurchId);
      expect(scoringService.getMembersNeedingAttention).toHaveBeenCalledWith(mockChurchId, 50);
      expect(syncService.cleanupExpiredChanges).toHaveBeenCalledWith(mockChurchId);

      expect(result).toEqual({
        engagementScored: 10,
        riskScored: 5,
        membersNeedingAttention: 2,
        recurringChargesDispatched: 0,
        lifeEventGreetingsSent: 0,
        ndprRecordsPurged: 0,
        syncQueuePurged: 3,
      });
    });

    it('should dispatch due recurring charges with a dedup jobId', async () => {
      model('recurringGiving').findMany.mockResolvedValue([{ id: 'rg-1' }, { id: 'rg-2' }]);

      const result = await processor.process(makeJob());

      expect(result.recurringChargesDispatched).toBe(2);
      expect(recurringQueue.add).toHaveBeenCalledTimes(2);
      expect(recurringQueue.add).toHaveBeenCalledWith(
        'charge',
        { recurringGivingId: 'rg-1', churchId: mockChurchId },
        expect.objectContaining({
          jobId: expect.stringMatching(/^recurring-rg-1-\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });
  });

  describe('purgeExpiredNdprData', () => {
    it('should detach FK refs and permanently delete inactive members + old audit logs', async () => {
      model('member').findMany.mockResolvedValue([{ id: 'm-1' }, { id: 'm-2' }]);
      model('member').deleteMany.mockResolvedValue({ count: 2 });
      model('auditLog').deleteMany.mockResolvedValue({ count: 3 });

      const job = makeJob();
      const result = await processor.process(job);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(model('profile').updateMany).toHaveBeenCalledWith({
        where: { member_id: { in: ['m-1', 'm-2'] } },
        data: { member_id: null },
      });
      expect(model('member').deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['m-1', 'm-2'] } },
      });
      expect(result.ndprRecordsPurged).toBe(5);
    });
  });

  describe('processLifeEventGreetings', () => {
    it('should send a greeting and mark the event notified', async () => {
      pastoralService.getUpcomingLifeEvents.mockResolvedValue([
        { id: 'ev-1', memberId: 'm-1', type: 'birthday' },
      ]);
      model('member').findUnique.mockResolvedValue({
        first_name: 'Ada',
        last_name: 'Obi',
        whatsapp_number: '+2348000000000',
        phone: null,
      });

      const job = makeJob();
      const result = await processor.process(job);

      expect(result.lifeEventGreetingsSent).toBe(1);
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        '+2348000000000',
        expect.stringContaining('Happy Birthday, Ada'),
        mockChurchId,
        undefined,
      );
      expect(pastoralService.markLifeEventNotified).toHaveBeenCalledWith('ev-1');
    });

    it('should skip members without a phone but still mark the event notified', async () => {
      pastoralService.getUpcomingLifeEvents.mockResolvedValue([
        { id: 'ev-1', memberId: 'm-1', type: 'wedding' },
      ]);
      model('member').findUnique.mockResolvedValue({
        first_name: 'Ada',
        last_name: 'Obi',
        whatsapp_number: null,
        phone: null,
      });

      const job = makeJob();
      const result = await processor.process(job);

      expect(result.lifeEventGreetingsSent).toBe(0);
      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
      expect(pastoralService.markLifeEventNotified).toHaveBeenCalledWith('ev-1');
    });
  });

  describe('composeLifeEventGreeting', () => {
    it('should compose greetings for known event types', () => {
      const greeting = (
        processor as unknown as {
          composeLifeEventGreeting: (t: string, n: string) => string | null;
        }
      ).composeLifeEventGreeting('birthday', 'Ada');

      expect(greeting).toContain('Happy Birthday, Ada');
    });

    it('should return null for unsupported event types', () => {
      const greeting = (
        processor as unknown as {
          composeLifeEventGreeting: (t: string, n: string) => string | null;
        }
      ).composeLifeEventGreeting('other', 'Ada');

      expect(greeting).toBeNull();
    });
  });
});
