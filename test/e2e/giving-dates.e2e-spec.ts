import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GivingService } from '../../src/giving/giving.service';
import { ReportsService } from '../../src/reports/reports.service';
import { BranchScopeService } from '../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../src/common/services/request-context.service';

describe('Giving dates on Essentials with PostgreSQL', () => {
  const prisma = new PrismaService();
  const church = randomUUID(),
    category = randomUUID();
  const receipt = {
    getCategoryPrefix: () => 'OFF',
    generateReceiptNumber: (prefix: string, count: number) => `2026/${prefix}/${count}`,
    generateReceipt: jest.fn(async () => Buffer.from('receipt')),
  };
  const service = new GivingService(
    prisma,
    { log: jest.fn() } as never,
    new Map(),
    receipt as never,
    {} as never,
    new BranchScopeService(new RequestContextService()),
    {} as never,
    {} as never,
  );
  const reports = new ReportsService(prisma);
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.church.create({ data: { id: church, name: 'Giving date fixture' } });
    await prisma.platformSubscription.upsert({
      where: { church_id: church },
      create: {
        church_id: church,
        plan: 'essentials',
        cycle: 'monthly',
        paid_until: new Date(Date.now() + 86400000),
      },
      update: { plan: 'essentials', paid_until: new Date(Date.now() + 86400000) },
    });
    await prisma.givingCategory.create({
      data: { id: category, church_id: church, name: 'Offering' },
    });
  });
  afterAll(async () => {
    try {
      await prisma.transaction.deleteMany({ where: { church_id: church } });
      await prisma.givingCategory.deleteMany({ where: { church_id: church } });
      await prisma.platformSubscription.deleteMany({ where: { church_id: church } });
      await prisma.auditLog.deleteMany({ where: { church_id: church } });
      await prisma.church.delete({ where: { id: church } });
    } finally {
      await prisma.$disconnect();
    }
  });
  it.each(['cash', 'bank_transfer'] as const)(
    'records a backdated %s gift while preserving its entry timestamp',
    async (type) => {
      const before = Date.now();
      const saved = await service.recordCashGiving(
        { categoryId: category, amount: 5000, type, givingDate: '2025-12-24' },
        church,
        randomUUID(),
      );
      expect(saved.givingDate).toBe('2025-12-24');
      expect(new Date(saved.createdAt).getTime()).toBeGreaterThanOrEqual(before);
      const rows = await service.listTransactions(church, {
        startDate: '2025-12-24',
        endDate: '2025-12-24',
      });
      expect(rows.data.some((row) => row.transactionId === saved.transactionId)).toBe(true);
      await service.generateReceipt(saved.transactionId, church);
      expect(receipt.generateReceipt).toHaveBeenLastCalledWith(
        expect.objectContaining({
          createdAt: new Date(saved.createdAt),
          givingDate: new Date('2025-12-24T00:00:00Z'),
        }),
      );
    },
  );
  it('uses the selected date for financial totals and monthly trends', async () => {
    const result = await reports.getFinancialReport(church, '2025-12-01', '2025-12-31');
    expect(result.grandTotal).toBe(10000);
    expect(result.monthlyTrend).toEqual([{ month: '2025-12', total: 10000 }]);
    const absent = await reports.getFinancialReport(church, '2026-10-01', '2026-10-31');
    expect(absent.grandTotal).toBe(0);
  });
  it('backfills historical dates without changing creation timestamps', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE transactions (church_id text, branch_id text, member_id text, created_at timestamp(3)) ON COMMIT DROP',
      );
      await tx.$executeRawUnsafe(
        "INSERT INTO transactions(created_at) VALUES ('2025-12-31 23:59:59.123')",
      );
      const sql = readFileSync(
        resolve(process.cwd(), 'prisma/migrations/20261022200000_giving_dates/migration.sql'),
        'utf8',
      );
      for (const statement of sql
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean))
        await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRawUnsafe<Array<{ day: string; entry: string }>>(
        'SELECT giving_date::text AS day,created_at::text AS entry FROM pg_temp.transactions',
      );
      expect(rows).toEqual([{ day: '2025-12-31', entry: '2025-12-31 23:59:59.123' }]);
    });
  });
});
