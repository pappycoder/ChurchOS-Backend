import { PrismaService } from '../../src/prisma/prisma.service';
import { GivingService } from '../../src/giving/giving.service';
import { ReportsService } from '../../src/reports/reports.service';
import { BranchScopeService } from '../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../src/common/services/request-context.service';

describe('Saved giving data reaches receipts and reports', () => {
  const prisma = new PrismaService();
  let churchId: string;
  let branchId: string;
  let transactionId: string;
  const receipt = { generateReceipt: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const giving = new GivingService(
    prisma,
    {} as never,
    new Map(),
    receipt as never,
    {} as never,
    new BranchScopeService(new RequestContextService()),
    {} as never,
    {} as never,
  );
  beforeAll(async () => {
    const church = await prisma.church.create({ data: { name: 'Receipt data fixture' } });
    churchId = church.id;
    await prisma.platformSubscription.create({
      data: {
        church_id: churchId,
        plan: 'network',
        cycle: 'monthly',
        paid_until: new Date('2099-01-01'),
      },
    });
    const branch = await prisma.branch.create({
      data: { church_id: churchId, name: 'West Branch' },
    });
    branchId = branch.id;
    const member = await prisma.member.create({
      data: {
        church_id: churchId,
        branch_id: branchId,
        first_name: 'Ada',
        last_name: 'Okafor',
        email: 'ada@example.test',
      },
    });
    const category = await prisma.givingCategory.create({
      data: { church_id: churchId, name: 'Offering' },
    });
    for (const currency of ['USD', 'NGN']) {
      const transaction = await prisma.transaction.create({
        data: {
          church_id: churchId,
          branch_id: branchId,
          member_id: member.id,
          category_id: category.id,
          amount: 1250.5,
          currency,
          type: 'bank_transfer',
          payment_gateway: 'manual',
          status: 'success',
          payment_reference: `${churchId}-${currency}`,
          receipt_number: '2026/OFF/0001',
          giving_date: new Date('2026-10-01'),
          created_at: new Date('2026-10-23T16:30:00Z'),
          notes: 'October giving',
        },
      });
      if (currency === 'USD') transactionId = transaction.id;
    }
  });
  afterAll(async () => {
    if (churchId) {
      await prisma.transaction.deleteMany({ where: { church_id: churchId } });
      await prisma.member.deleteMany({ where: { church_id: churchId } });
      await prisma.givingCategory.deleteMany({ where: { church_id: churchId } });
      await prisma.branch.deleteMany({ where: { church_id: churchId } });
      await prisma.platformSubscription.deleteMany({ where: { church_id: churchId } });
      await prisma.auditLog.deleteMany({ where: { church_id: churchId } });
      await prisma.church.delete({ where: { id: churchId } });
    }
    await prisma.$disconnect();
  });
  it('resolves saved names and branch, keeps both dates and uses the legacy bank-method fallback', async () => {
    const file = await giving.generateReceipt(transactionId, churchId, {
      church_id: churchId,
      branch_id: branchId,
      is_admin_hq: false,
      role: 'secretary',
    });
    expect(file.filename).toBe('receipt-2026-OFF-0001.pdf');
    expect(receipt.generateReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: transactionId,
        memberName: 'Ada Okafor',
        memberEmail: 'ada@example.test',
        branchName: 'West Branch',
        amount: 1250.5,
        currency: 'USD',
        givingDate: new Date('2026-10-01'),
        createdAt: new Date('2026-10-23T16:30:00Z'),
        paymentMethod: 'bank_transfer',
        paymentReference: `${churchId}-USD`,
        notes: 'October giving',
      }),
    );
  });
  it('keeps same-period NGN and USD totals separate and includes the final giving day', async () => {
    const reports = new ReportsService(prisma);
    for (const currency of ['NGN', 'USD']) {
      const report = await reports.getFinancialReport(
        churchId,
        '2026-10-01',
        '2026-10-01',
        branchId,
        currency,
      );
      expect(report).toMatchObject({
        currency,
        grandTotal: 1250.5,
        transactionCount: 1,
        averageAmount: 1250.5,
      });
      expect(report.byCategory).toEqual([{ name: 'Offering', total: 1250.5, count: 1 }]);
      expect(report.monthlyTrend).toEqual([{ month: '2026-10', total: 1250.5 }]);
    }
  });
});
