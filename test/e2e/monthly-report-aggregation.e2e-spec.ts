import { PrismaService } from '../../src/prisma/prisma.service';
import { ReportsService } from '../../src/reports/reports.service';

describe('SQL monthly report isolation and boundaries', () => {
  const prisma = new PrismaService();
  const reports = new ReportsService(prisma);
  const churches: string[] = [];
  const branches: string[] = [];
  let branchA: string;
  let church: string;
  beforeAll(async () => {
    for (let i = 0; i < 2; i++) {
      const c = await prisma.church.create({ data: { name: 'Monthly aggregation test' } });
      churches.push(c.id);
      await prisma.platformSubscription.create({
        data: {
          church_id: c.id,
          plan: 'network',
          cycle: 'monthly',
          paid_until: new Date('2099-01-01'),
        },
      });
      const branch = await prisma.branch.create({
        data: { church_id: c.id, name: 'Fixture branch' },
      });
      branches.push(branch.id);
    }
    church = churches[0];
    branchA = branches[0];
    const otherBranch = await prisma.branch.create({
      data: { church_id: church, name: 'Other branch' },
    });
    for (const [tenant, branch] of [
      [church, branchA],
      [church, otherBranch.id],
      [churches[1], branches[1]],
    ]) {
      const service = await prisma.service.create({
        data: { church_id: tenant, branch_id: branch, name: 'Fixture' },
      });
      for (const date of [
        '2026-09-30T23:59:59Z',
        '2026-10-01T00:00:00Z',
        '2026-10-31T23:59:59.999Z',
        '2026-11-01T00:00:00Z',
      ]) {
        await prisma.member.create({
          data: {
            church_id: tenant,
            branch_id: branch,
            first_name: 'Monthly',
            last_name: 'Fixture',
            created_at: new Date(date),
          },
        });
        await prisma.attendance.create({
          data: { church_id: tenant, service_id: service.id, checkin_at: new Date(date) },
        });
      }
      await prisma.transaction.createMany({
        data: [
          { amount: 12.5, currency: 'NGN', status: 'success', giving_date: new Date('2026-10-01') },
          { amount: 2.25, currency: 'NGN', status: 'success', giving_date: new Date('2026-10-31') },
          { amount: 0, currency: 'NGN', status: 'success', giving_date: new Date('2026-11-01') },
          { amount: 99, currency: 'USD', status: 'success', giving_date: new Date('2026-10-01') },
          { amount: 999, currency: 'NGN', status: 'pending', giving_date: new Date('2026-10-01') },
        ].map((row) => ({
          ...row,
          church_id: tenant,
          branch_id: branch,
          status: row.status as 'success' | 'pending',
          payment_gateway: 'manual' as const,
          type: 'cash' as const,
        })),
      });
    }
  });
  afterAll(async () => {
    for (const id of churches) {
      await prisma.transaction.deleteMany({ where: { church_id: id } });
      await prisma.attendance.deleteMany({ where: { church_id: id } });
      await prisma.member.deleteMany({ where: { church_id: id } });
      await prisma.service.deleteMany({ where: { church_id: id } });
      await prisma.branch.deleteMany({ where: { church_id: id } });
      await prisma.platformSubscription.deleteMany({ where: { church_id: id } });
      await prisma.auditLog.deleteMany({ where: { church_id: id } });
      await prisma.church.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });
  it('keeps financial currency, status, tenant, branch and zero-value month totals correct', async () => {
    const scoped = await reports.getFinancialReport(
      church,
      '2026-10-01',
      '2026-11-01',
      branchA,
      'NGN',
    );
    expect(scoped.monthlyTrend).toEqual([
      { month: '2026-10', total: 14.75 },
      { month: '2026-11', total: 0 },
    ]);
    expect(scoped.grandTotal).toBe(14.75);
    const hq = await reports.getFinancialReport(
      church,
      '2026-10-01',
      '2026-10-31',
      undefined,
      'NGN',
    );
    expect(hq.monthlyTrend).toEqual([{ month: '2026-10', total: 29.5 }]);
  });
  it('groups members and attendance in UTC and includes the full final day without crossing branches', async () => {
    const member = await reports.getMemberReport(church, '2026-10-01', '2026-10-31', branchA);
    expect(member.monthlyGrowth).toEqual([{ month: '2026-10', total: 2 }]);
    const attendance = await reports.getAttendanceReport(
      church,
      '2026-10-01',
      '2026-10-31',
      branchA,
    );
    expect(attendance.monthlyTrend).toEqual([{ month: '2026-10', total: 2 }]);
    expect(
      (await reports.getMemberReport(church, '2026-10-01', '2026-10-31')).monthlyGrowth,
    ).toEqual([{ month: '2026-10', total: 4 }]);
  });
});
