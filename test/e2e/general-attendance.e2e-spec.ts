import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import { BranchScopeService, ViewerScope } from '../../src/common/services/branch-scope.service';

describe('Mixed services and general headcounts with PostgreSQL', () => {
  const prisma = new PrismaService(),
    context = new RequestContextService();
  const api = new AttendanceService(
    prisma,
    context,
    { log: jest.fn() } as never,
    new BranchScopeService(context),
  );
  const church = randomUUID(),
    foreign = randomUUID(),
    branch = randomUUID(),
    branchB = randomUUID(),
    foreignBranch = randomUUID(),
    service = randomUUID(),
    shared = randomUUID(),
    other = randomUUID(),
    foreignService = randomUUID(),
    user = randomUUID();
  const viewer: ViewerScope = { church_id: church, branch_id: branch, role: 'staff' };
  const hq = { ...viewer, is_admin_hq: true };
  const input = { serviceId: service, attendanceDate: '2026-10-18', total: 100 };
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.church.createMany({
      data: [
        { id: church, name: 'Headcount fixture' },
        { id: foreign, name: 'Foreign fixture' },
      ],
    });
    await prisma.branch.createMany({
      data: [
        { id: branch, church_id: church, name: 'A' },
        { id: branchB, church_id: church, name: 'B' },
        { id: foreignBranch, church_id: foreign, name: 'Foreign' },
      ],
    });
    await prisma.service.createMany({
      data: [
        { id: service, church_id: church, branch_id: branch, name: 'Mixed A', category: 'mixed' },
        { id: other, church_id: church, branch_id: branchB, name: 'Mixed B', category: 'mixed' },
        { id: shared, church_id: church, name: 'Shared mixed', category: 'mixed' },
        {
          id: foreignService,
          church_id: foreign,
          branch_id: foreignBranch,
          name: 'Foreign mixed',
          category: 'mixed',
        },
      ],
    });
  });
  afterAll(async () => {
    const ids = [church, foreign];
    try {
      await prisma.attendanceSession.deleteMany({ where: { church_id: { in: ids } } });
      await prisma.attendance.deleteMany({ where: { church_id: { in: ids } } });
      await prisma.service.deleteMany({ where: { church_id: { in: ids } } });
      await prisma.cellGroup.deleteMany({ where: { church_id: { in: ids } } });
      await prisma.member.deleteMany({ where: { church_id: { in: ids } } });
      await prisma.branch.deleteMany({ where: { church_id: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { church_id: { in: ids } } });
      await prisma.church.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await prisma.$disconnect();
    }
  });
  it('persists optional blank fields and zero without creating check-ins', async () => {
    const result = await api.recordGeneralAttendance(
      { ...input, childrenCount: 0 },
      church,
      user,
      viewer,
    );
    expect(result).toMatchObject({
      total: 100,
      adultCount: null,
      childrenCount: 0,
      maleCount: null,
      femaleCount: null,
    });
    expect(await prisma.attendance.count({ where: { church_id: church } })).toBe(0);
  });
  it('rejects duplicates atomically including concurrent creates', async () => {
    await expect(api.recordGeneralAttendance(input, church, user, viewer)).rejects.toThrow(
      'already recorded',
    );
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        api.recordGeneralAttendance(
          { ...input, attendanceDate: '2026-10-19' },
          church,
          user,
          viewer,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('supports independent complete and partial breakdowns with immutable service/date', async () => {
    const rows = await api.listGeneralAttendance(
      church,
      { startDate: input.attendanceDate, endDate: input.attendanceDate },
      viewer,
    );
    expect(rows.data).toHaveLength(1);
    const updated = await api.updateGeneralAttendance(
      rows.data[0].id,
      { total: 100, adultCount: 60, childrenCount: 40, femaleCount: 50 },
      church,
      user,
      viewer,
    );
    expect(updated).toMatchObject({
      attendanceDate: input.attendanceDate,
      adultCount: 60,
      childrenCount: 40,
      maleCount: null,
      femaleCount: 50,
    });
    await expect(
      api.updateGeneralAttendance(updated.id, { total: 5, adultCount: 6 }, church, user, viewer),
    ).rejects.toThrow('exceed');
  });
  it('enforces branch/tenant isolation for writes, reads and corrections even under HQ', async () => {
    await expect(
      api.recordGeneralAttendance({ ...input, serviceId: other }, church, user, viewer),
    ).rejects.toThrow('not found');
    const record = await api.recordGeneralAttendance(
      { ...input, serviceId: other },
      church,
      user,
      hq,
    );
    await expect(
      api.updateGeneralAttendance(record.id, { total: 90 }, church, user, viewer),
    ).rejects.toThrow('not found');
    const own = await api.listGeneralAttendance(church, { branchId: branchB }, viewer);
    expect(own.data.every((r) => r.branchId === branch)).toBe(true);
    expect((await api.listGeneralAttendance(church, { branchId: branchB }, hq)).data).toHaveLength(
      1,
    );
    await expect(
      api.recordGeneralAttendance({ ...input, serviceId: foreignService }, church, user, hq),
    ).rejects.toThrow('not found');
    await expect(api.listGeneralAttendance(foreign, {}, hq)).rejects.toThrow('Invalid church');
  });
  it('requires a valid church branch for shared services and pins branch users', async () => {
    await expect(
      api.recordGeneralAttendance({ ...input, serviceId: shared }, church, user, hq),
    ).rejects.toThrow('Select a branch');
    await expect(
      api.recordGeneralAttendance(
        { ...input, serviceId: shared, branchId: foreignBranch },
        church,
        user,
        hq,
      ),
    ).rejects.toThrow('not found');
    await expect(
      api.recordGeneralAttendance(
        { ...input, serviceId: shared, branchId: branchB },
        church,
        user,
        viewer,
      ),
    ).rejects.toThrow('meeting branch');
    const record = await api.recordGeneralAttendance(
      { ...input, serviceId: shared },
      church,
      user,
      viewer,
    );
    expect(record.branchId).toBe(branch);
  });
  it('keeps mixed-service individual categories unspecified and headcounts separate', async () => {
    const row = await api.recordVisitorAttendance(
      { serviceId: service, visitorName: 'Unnamed category' },
      church,
      user,
    );
    expect(row.category).toBe('unspecified');
    const summary = await api.getGeneralAttendanceSummary(
      church,
      { serviceId: service, startDate: '2026-10-18', endDate: '2026-10-18' },
      viewer,
    );
    expect(summary).toMatchObject({
      total: 100,
      reportCount: 1,
      adultCount: 60,
      childrenCount: 40,
      unspecifiedAgeCount: 0,
      unspecifiedGenderCount: 50,
    });
    expect(await prisma.attendance.count({ where: { church_id: church } })).toBe(1);
  });
  it('enforces numeric constraints in PostgreSQL as well as the API', async () => {
    await expect(
      prisma.attendanceSession.create({
        data: {
          church_id: church,
          branch_id: branch,
          service_id: service,
          attendance_date: new Date('2026-10-20'),
          total: 5,
          adult_count: 6,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.attendanceSession.create({
        data: {
          church_id: church,
          branch_id: branch,
          service_id: service,
          attendance_date: new Date('2026-10-20'),
          total: 5,
          male_count: -1,
        },
      }),
    ).rejects.toThrow();
    const state = await prisma.$queryRaw<
      { relrowsecurity: boolean }[]
    >`SELECT relrowsecurity FROM pg_class WHERE relname = 'attendance_sessions'`;
    expect(state[0].relrowsecurity).toBe(true);
  });
  it('allows a member at the next recurring service date but rejects a second check-in that day', async () => {
    const memberId = randomUUID();
    await prisma.member.create({
      data: {
        id: memberId,
        church_id: church,
        branch_id: branch,
        first_name: 'Weekly',
        last_name: 'Member',
      },
    });
    const earlier = new Date(Date.now() - 7 * 86400000);
    await prisma.attendance.create({
      data: {
        church_id: church,
        service_id: service,
        member_id: memberId,
        checkin_at: earlier,
        attendance_date: new Date(earlier.toISOString().slice(0, 10)),
      },
    });
    const recorded = await api.recordAttendance({ serviceId: service, memberId }, church, user);
    expect(recorded.memberId).toBe(memberId);
    await expect(
      api.recordAttendance({ serviceId: service, memberId }, church, user),
    ).rejects.toThrow('already checked in');
    expect(
      await prisma.attendance.count({ where: { service_id: service, member_id: memberId } }),
    ).toBe(2);
  });
});
