/**
 * @file reports.service.spec.ts
 * @description Unit tests for ReportsService.
 *
 * @module test/unit/reports/reports.service.spec
 * @since 1.0.0
 */

import { ReportsService } from '../../../src/reports/reports.service';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    transaction: {
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
    givingCategory: {
      findMany: jest.Mock;
    };
    attendance: {
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    service: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    member: {
      count: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const churchId = 'ccc-cccc-cccc-cccc';
  const startDate = '2026-01-01';
  const endDate = '2026-06-30';
  const branchId = 'bbb-bbbb-bbbb-bbbb';

  beforeEach(() => {
    prisma = {
      transaction: {
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
      givingCategory: {
        findMany: jest.fn(),
      },
      attendance: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
      service: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      member: {
        count: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new ReportsService(prisma as unknown as PrismaService);
  });

  describe('getFinancialReport', () => {
    it('should return correct totals with no filters', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 500000 },
        _count: 50,
      });
      prisma.transaction.groupBy.mockResolvedValue([
        { category_id: 'cat-1', _sum: { amount: 300000 }, _count: 30 },
        { category_id: 'cat-2', _sum: { amount: 200000 }, _count: 20 },
      ]);
      prisma.givingCategory.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Tithe' },
        { id: 'cat-2', name: 'Offering' },
      ]);
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.getFinancialReport(churchId, startDate, endDate);

      expect(result.grandTotal).toBe(500000);
      expect(result.transactionCount).toBe(50);
      expect(result.averageAmount).toBe(10000);
      expect(result.byCategory).toHaveLength(2);
      expect(result.byCategory[0]).toEqual({ name: 'Tithe', total: 300000, count: 30 });
      expect(result.byCategory[1]).toEqual({ name: 'Offering', total: 200000, count: 20 });
    });

    it('should return empty when no transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
        _count: 0,
      });
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.givingCategory.findMany.mockResolvedValue([]);
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.getFinancialReport(churchId, startDate, endDate);

      expect(result.grandTotal).toBe(0);
      expect(result.transactionCount).toBe(0);
      expect(result.averageAmount).toBe(0);
      expect(result.byCategory).toHaveLength(0);
      expect(result.monthlyTrend).toHaveLength(0);
    });

    it('should pass branch_id to query when branchId is provided', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 100000 },
        _count: 10,
      });
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.givingCategory.findMany.mockResolvedValue([]);
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.getFinancialReport(churchId, startDate, endDate, branchId);

      const aggregateCall = prisma.transaction.aggregate.mock.calls[0][0];
      expect(aggregateCall.where.branch_id).toBe(branchId);

      const groupByCall = prisma.transaction.groupBy.mock.calls[0][0];
      expect(groupByCall.where.branch_id).toBe(branchId);
    });
  });

  describe('getAttendanceReport', () => {
    it('should return correct totals', async () => {
      prisma.attendance.aggregate.mockResolvedValue({ _count: 300 });
      prisma.service.count.mockResolvedValue(12);
      prisma.service.findMany.mockResolvedValue([
        { name: 'Sunday Worship', _count: { attendance: 200 } },
        { name: 'Midweek Service', _count: { attendance: 100 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getAttendanceReport(churchId, startDate, endDate);

      expect(result.totalAttendance).toBe(300);
      expect(result.serviceCount).toBe(12);
      expect(result.averagePerService).toBe(25);
      expect(result.byService).toHaveLength(2);
      expect(result.byService[0].name).toBe('Sunday Worship');
      expect(result.byService[0].total).toBe(200);
      expect(result.byService[1].name).toBe('Midweek Service');
      expect(result.byService[1].total).toBe(100);
    });

    it('should return empty when no services', async () => {
      prisma.attendance.aggregate.mockResolvedValue({ _count: 0 });
      prisma.service.count.mockResolvedValue(0);
      prisma.service.findMany.mockResolvedValue([]);
      prisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getAttendanceReport(churchId, startDate, endDate);

      expect(result.totalAttendance).toBe(0);
      expect(result.serviceCount).toBe(0);
      expect(result.averagePerService).toBe(0);
      expect(result.byService).toHaveLength(0);
      expect(result.monthlyTrend).toHaveLength(0);
    });
  });

  describe('getMemberReport', () => {
    it('should return correct member counts', async () => {
      prisma.member.count.mockResolvedValueOnce(500).mockResolvedValueOnce(25);
      prisma.member.groupBy
        .mockResolvedValueOnce([
          { status: 'active', _count: 420 },
          { status: 'inactive', _count: 80 },
        ])
        .mockResolvedValueOnce([
          { gender: 'male', _count: 260 },
          { gender: 'female', _count: 240 },
        ]);
      prisma.member.findMany.mockResolvedValue([]);

      const result = await service.getMemberReport(churchId, startDate, endDate);

      expect(result.totalMembers).toBe(500);
      expect(result.newMembersInPeriod).toBe(25);
      expect(result.activeMembers).toBe(420);
      expect(result.byStatus).toHaveLength(2);
      expect(result.byGender).toHaveLength(2);
      expect(result.byGender[0]).toEqual({ gender: 'male', count: 260 });
      expect(result.byGender[1]).toEqual({ gender: 'female', count: 240 });
    });

    it('should return empty when no members', async () => {
      prisma.member.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prisma.member.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.member.findMany.mockResolvedValue([]);

      const result = await service.getMemberReport(churchId, startDate, endDate);

      expect(result.totalMembers).toBe(0);
      expect(result.newMembersInPeriod).toBe(0);
      expect(result.activeMembers).toBe(0);
      expect(result.byStatus).toHaveLength(0);
      expect(result.byGender).toHaveLength(0);
      expect(result.monthlyGrowth).toHaveLength(0);
    });
  });
});
