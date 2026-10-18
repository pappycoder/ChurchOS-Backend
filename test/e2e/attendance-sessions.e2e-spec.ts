import { randomUUID } from 'node:crypto';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { AdminService } from '../../src/admin/admin.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import { BranchScopeService, ViewerScope } from '../../src/common/services/branch-scope.service';

describe('Shared attendance sessions with PostgreSQL', () => {
  const prisma = new PrismaService(),
    context = new RequestContextService(),
    scopes = new BranchScopeService(context),
    audit = { log: jest.fn() } as never;
  const attendance = new AttendanceService(prisma, context, audit, scopes),
    admin = new AdminService(prisma, context, audit, scopes);
  const church = randomUUID(),
    branch = randomUUID(),
    branchB = randomUUID(),
    dept = randomUUID(),
    otherDept = randomUUID(),
    group = randomUUID(),
    otherGroup = randomUUID(),
    event = randomUUID(),
    member = randomUUID(),
    owner = randomUUID(),
    user = randomUUID();
  const viewer: ViewerScope = {
    church_id: church,
    branch_id: branch,
    member_id: owner,
    role: 'custom',
    permissions: [
      'departments:own:read',
      'departments:own:update',
      'cell_groups:own:read',
      'cell_groups:own:update',
    ],
  };
  const input = { attendanceDate: '2026-10-18', total: 25 };
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.church.create({ data: { id: church, name: 'Shared session fixtures' } });
    await prisma.branch.createMany({
      data: [
        { id: branch, church_id: church, name: 'A' },
        { id: branchB, church_id: church, name: 'B' },
      ],
    });
    await prisma.member.createMany({
      data: [
        {
          id: member,
          church_id: church,
          branch_id: branch,
          first_name: 'Member',
          last_name: 'Test',
        },
        { id: owner, church_id: church, branch_id: branch, first_name: 'Owner', last_name: 'Test' },
      ],
    });
    await prisma.department.createMany({
      data: [
        {
          id: dept,
          church_id: church,
          branch_id: branch,
          name: 'Department',
          head_member_id: owner,
        },
        { id: otherDept, church_id: church, branch_id: branchB, name: 'Other Department' },
      ],
    });
    await prisma.departmentMember.create({ data: { department_id: dept, member_id: member } });
    await prisma.cellGroup.createMany({
      data: [
        { id: group, church_id: church, branch_id: branch, name: 'Group', leader_id: owner },
        { id: otherGroup, church_id: church, branch_id: branchB, name: 'Other Group' },
      ],
    });
    await prisma.event.create({
      data: {
        id: event,
        church_id: church,
        branch_id: branch,
        title: 'Event',
        start_date: new Date(input.attendanceDate),
      },
    });
  });
  afterAll(async () => {
    try {
      await prisma.attendanceSession.deleteMany({ where: { church_id: church } });
      await prisma.departmentAttendance.deleteMany({
        where: { department: { church_id: church } },
      });
      await prisma.cellGroupAttendance.deleteMany({ where: { cell_group: { church_id: church } } });
      await prisma.cellGroupMember.deleteMany({ where: { cell_group: { church_id: church } } });
      await prisma.departmentMember.deleteMany({ where: { department: { church_id: church } } });
      await prisma.department.deleteMany({ where: { church_id: church } });
      await prisma.cellGroup.deleteMany({ where: { church_id: church } });
      await prisma.event.deleteMany({ where: { church_id: church } });
      await prisma.member.deleteMany({ where: { church_id: church } });
      await prisma.branch.deleteMany({ where: { church_id: church } });
      await prisma.auditLog.deleteMany({ where: { church_id: church } });
      await prisma.church.delete({ where: { id: church } });
    } finally {
      await prisma.$disconnect();
    }
  });
  it.each([
    ['department', dept],
    ['cell_group', group],
    ['event', event],
  ] as const)(
    'records total-only %s sessions with no compulsory named attendees',
    async (type, id) => {
      const row = await attendance.recordSession(type, id, input, church, user, viewer);
      expect(row).toMatchObject({
        contextType: type,
        contextId: id,
        total: 25,
        adultCount: null,
        childrenCount: null,
        maleCount: null,
        femaleCount: null,
      });
      expect((await attendance.listSessions(type, id, church, {}, viewer)).data).toHaveLength(1);
    },
  );
  it('links department details recorded after the session without changing the reported total', async () => {
    await admin.recordDepartmentAttendance(
      dept,
      { memberId: member, meetingDate: input.attendanceDate, status: 'present' },
      church,
      user,
      viewer,
    );
    const detail = await prisma.departmentAttendance.findFirst({ where: { department_id: dept } });
    const session = await prisma.attendanceSession.findFirst({ where: { department_id: dept } });
    expect(detail?.session_id).toBe(session?.id);
    expect(session?.total).toBe(25);
  });
  it('links earlier department details when a session is recorded later', async () => {
    const date = '2026-10-19';
    await admin.recordDepartmentAttendance(
      dept,
      { memberId: member, meetingDate: date, status: 'present' },
      church,
      user,
      viewer,
    );
    const row = await attendance.recordSession(
      'department',
      dept,
      { ...input, attendanceDate: date, adultCount: 20, maleCount: 10 },
      church,
      user,
      viewer,
    );
    expect(
      (
        await prisma.departmentAttendance.findFirst({
          where: { department_id: dept, meeting_date: new Date(date) },
        })
      )?.session_id,
    ).toBe(row.id);
    expect(row).toMatchObject({
      total: 25,
      adultCount: 20,
      childrenCount: null,
      maleCount: 10,
      femaleCount: null,
    });
  });
  it('preserves HQ ownership checks on department and group creates and corrections', async () => {
    for (const [type, id] of [
      ['department', otherDept],
      ['cell_group', otherGroup],
    ] as const) {
      await expect(
        attendance.recordSession(type, id, input, church, user, { ...viewer, is_admin_hq: true }),
      ).rejects.toThrow('own');
      const broad = { ...viewer, is_admin_hq: true, permissions: [] };
      const row = await attendance.recordSession(type, id, input, church, user, broad);
      await expect(
        attendance.updateSession(type, id, row.id, { total: 10 }, church, user, {
          ...viewer,
          is_admin_hq: true,
        }),
      ).rejects.toThrow('own');
      await expect(attendance.listSessions(type, id, church, {}, viewer)).rejects.toThrow(
        'not found',
      );
      expect(
        (await attendance.listSessions(type, id, church, {}, { ...viewer, is_admin_hq: true }))
          .data,
      ).toHaveLength(1);
    }
  });
  it('uses reported group totals without adding named details twice', async () => {
    await prisma.cellGroupAttendance.create({
      data: {
        cell_group_id: group,
        member_id: member,
        meeting_date: new Date(input.attendanceDate),
        status: 'present',
      },
    });
    const summary = await admin.getCellGroupAttendanceSummary(group, church);
    expect(summary).toMatchObject({ totalMeetings: 1, averageAttendance: 25 });
    await prisma.cellGroupAttendance.create({
      data: {
        cell_group_id: group,
        member_id: member,
        meeting_date: new Date('2026-10-19'),
        status: 'absent',
      },
    });
    expect(await admin.getCellGroupAttendanceSummary(group, church)).toMatchObject({
      totalMeetings: 2,
      averageAttendance: 13,
    });
  });
  it('rejects cross-context updates and database rows with zero or multiple contexts', async () => {
    const session = await prisma.attendanceSession.findFirstOrThrow({
      where: { department_id: dept },
    });
    await expect(
      attendance.updateSession('cell_group', group, session.id, { total: 1 }, church, user, viewer),
    ).rejects.toThrow('not found');
    for (const parents of [{}, { service_id: null, event_id: event, department_id: dept }]) {
      await expect(
        prisma.attendanceSession.create({
          data: {
            church_id: church,
            branch_id: branch,
            attendance_date: new Date('2026-10-20'),
            total: 1,
            ...parents,
          },
        }),
      ).rejects.toThrow();
    }
  });
  it.each(['department', 'cell_group'] as const)(
    'bulk %s attendance inserts, corrects duplicates and rejects outside members atomically',
    async (type) => {
      const id = type === 'department' ? dept : group;
      if (type === 'department')
        await prisma.departmentMember.create({ data: { department_id: id, member_id: owner } });
      else
        await prisma.cellGroupMember.createMany({
          data: [member, owner].map((member_id) => ({ cell_group_id: id, member_id })),
        });
      const batch = { memberIds: [member, owner], meetingDate: '2026-10-21', status: 'present' };
      await admin.recordMeetingRoster(type, id, batch, church, user, viewer);
      await admin.recordMeetingRoster(type, id, { ...batch, status: 'late' }, church, user, viewer);
      const rows =
        type === 'department'
          ? await prisma.departmentAttendance.findMany({
              where: { department_id: id, meeting_date: new Date(batch.meetingDate) },
            })
          : await prisma.cellGroupAttendance.findMany({
              where: { cell_group_id: id, meeting_date: new Date(batch.meetingDate) },
            });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.status === 'late')).toBe(true);
      await expect(
        admin.recordMeetingRoster(
          type,
          id,
          { ...batch, memberIds: [member, randomUUID()], status: 'absent' },
          church,
          user,
          viewer,
        ),
      ).rejects.toThrow('outside');
      const unchanged =
        type === 'department'
          ? await prisma.departmentAttendance.findMany({
              where: { department_id: id, meeting_date: new Date(batch.meetingDate) },
            })
          : await prisma.cellGroupAttendance.findMany({
              where: { cell_group_id: id, meeting_date: new Date(batch.meetingDate) },
            });
      expect(unchanged.every((row) => row.status === 'late')).toBe(true);
    },
  );
});
