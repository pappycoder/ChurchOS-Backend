import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GivingService } from '../../src/giving/giving.service';
import { BranchScopeService } from '../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../src/common/services/request-context.service';

describe('Cell group meeting giving with PostgreSQL', () => {
  const prisma = new PrismaService();
  const churchId = randomUUID(),
    branchId = randomUUID(),
    otherBranch = randomUUID();
  const memberId = randomUUID(),
    otherMember = randomUUID(),
    groupId = randomUUID(),
    otherGroup = randomUUID(),
    categoryId = randomUUID();
  const leader = {
    church_id: churchId,
    role: 'cell_leader',
    branch_id: branchId,
    member_id: memberId,
    permissions: ['cell_groups:own:read', 'cell_groups:giving:create', 'cell_groups:giving:read'],
  };
  const service = new GivingService(
    prisma,
    { log: jest.fn() } as never,
    new Map(),
    {
      getCategoryPrefix: () => 'OFF',
      generateReceiptNumber: (prefix: string, count: number) => `2026/${prefix}/${count}`,
    } as never,
    {} as never,
    new BranchScopeService(new RequestContextService()),
    {} as never,
    {} as never,
  );
  const input = (date: string) => ({
    categoryId,
    amount: 5000,
    type: 'cash' as const,
    cellGroupMeetingDate: date,
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.church.create({ data: { id: churchId, name: 'Isolated meeting giving tests' } });
    await prisma.branch.createMany({
      data: [
        { id: branchId, church_id: churchId, name: 'Lekki' },
        { id: otherBranch, church_id: churchId, name: 'HQ' },
      ],
    });
    await prisma.member.createMany({
      data: [
        {
          id: memberId,
          church_id: churchId,
          branch_id: branchId,
          first_name: 'Cell',
          last_name: 'Leader',
        },
        {
          id: otherMember,
          church_id: churchId,
          branch_id: otherBranch,
          first_name: 'Other',
          last_name: 'Leader',
        },
      ],
    });
    await prisma.cellGroup.createMany({
      data: [
        {
          id: groupId,
          church_id: churchId,
          branch_id: branchId,
          leader_id: memberId,
          name: 'Lekki Fellowship',
        },
        {
          id: otherGroup,
          church_id: churchId,
          branch_id: otherBranch,
          leader_id: otherMember,
          name: 'HQ Fellowship',
        },
      ],
    });
    await prisma.givingCategory.create({
      data: { id: categoryId, church_id: churchId, name: 'Offering' },
    });
  });
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { church_id: churchId } });
    await prisma.givingCategory.deleteMany({ where: { church_id: churchId } });
    await prisma.cellGroup.deleteMany({ where: { church_id: churchId } });
    await prisma.member.deleteMany({ where: { church_id: churchId } });
    await prisma.branch.deleteMany({ where: { church_id: churchId } });
    await prisma.auditLog.deleteMany({ where: { church_id: churchId } });
    await prisma.church.delete({ where: { id: churchId } });
    await prisma.$disconnect();
  });

  it('allows exactly one of two concurrent submissions for the same meeting', async () => {
    const outcomes = await Promise.allSettled([
      service.recordCellGroupGiving(groupId, input('2026-10-11'), churchId, randomUUID(), leader),
      service.recordCellGroupGiving(groupId, input('2026-10-11'), churchId, randomUUID(), leader),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason.message).toContain('Giving has already been recorded');
    expect(await prisma.transaction.count({ where: { church_id: churchId } })).toBe(1);
    const treasurer = { ...leader, role: 'treasurer', permissions: ['cell_groups:giving:read'] };
    const result = await service.getCellGroupGiving(groupId, churchId, {}, treasurer);
    expect(result.total).toBe(1);
    expect(result.summary.allTimeTotal).toBe(5000);
    expect(result.data[0].cellGroupMeetingDate).toBe('2026-10-11');
    expect((await service.getTransactionsSummary(churchId, {}, treasurer)).allTimeTotal).toBe(5000);
  });

  it('allows another meeting but prevents a leader recording for another group', async () => {
    await service.recordCellGroupGiving(
      groupId,
      input('2026-10-12'),
      churchId,
      randomUUID(),
      leader,
    );
    await expect(
      service.recordCellGroupGiving(
        otherGroup,
        input('2026-10-12'),
        churchId,
        randomUUID(),
        leader,
      ),
    ).rejects.toThrow('Cell group not found');
    const result = await service.getCellGroupGiving(groupId, churchId, {}, leader);
    expect(result.total).toBe(2);
    expect(result.summary.allTimeTotal).toBe(10000);
  });

  it('HQ leaders can read other groups but cannot record giving there', async () => {
    const hq = { ...leader, is_admin_hq: true };
    expect((await service.getCellGroupGiving(otherGroup, churchId, {}, hq)).total).toBe(0);
    await expect(
      service.recordCellGroupGiving(otherGroup, input('2026-10-14'), churchId, randomUUID(), hq),
    ).rejects.toThrow('You can only record giving');
    await expect(
      service.recordCashGiving(
        { ...input('2026-10-14'), cellGroupId: otherGroup },
        churchId,
        randomUUID(),
        hq,
      ),
    ).rejects.toThrow('You can only record giving');
    expect(await prisma.transaction.count({ where: { church_id: churchId } })).toBe(2);
  });

  it('keeps branch readers scoped and HQ readers overall, without recording access', async () => {
    const treasurer = { ...leader, role: 'treasurer', permissions: ['cell_groups:giving:read'] };
    await expect(service.getCellGroupGiving(otherGroup, churchId, {}, treasurer)).rejects.toThrow(
      'Cell group not found',
    );
    expect(
      (
        await service.getCellGroupGiving(
          otherGroup,
          churchId,
          {},
          { ...treasurer, is_admin_hq: true },
        )
      ).total,
    ).toBe(0);
    await expect(
      service.recordCellGroupGiving(
        groupId,
        input('2026-10-13'),
        churchId,
        randomUUID(),
        treasurer,
      ),
    ).rejects.toThrow('recording is not permitted');
    expect(await prisma.transaction.count({ where: { church_id: churchId } })).toBe(2);
  });
});
