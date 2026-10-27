import { seedWorkflowSubscription } from '../helpers/workflow-subscription.helper';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminService } from '../../src/admin/admin.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import { BranchScopeService, ViewerScope } from '../../src/common/services/branch-scope.service';

describe('Department meeting attendance with PostgreSQL', () => {
  const prisma = new PrismaService();
  const context = new RequestContextService();
  const service = new AdminService(
    prisma,
    context,
    { log: jest.fn() } as never,
    new BranchScopeService(context),
  );
  const church = randomUUID(),
    otherChurch = randomUUID(),
    branch = randomUUID(),
    otherBranch = randomUUID();
  const head = randomUUID(),
    otherHead = randomUUID(),
    attendee = randomUUID(),
    department = randomUUID(),
    otherDepartment = randomUUID();
  const viewer: ViewerScope = {
    church_id: church,
    branch_id: branch,
    role: 'department_head',
    member_id: head,
    permissions: [
      'departments:read',
      'departments:own:read',
      'departments:own:update',
      'departments:update',
    ],
  };
  const input = { memberId: attendee, meetingDate: '2026-10-17', status: 'present' };
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.church.createMany({
      data: [
        { id: church, name: 'Department attendance test' },
        { id: otherChurch, name: 'Other tenant' },
      ],
    });
    await seedWorkflowSubscription(prisma, church);
    await seedWorkflowSubscription(prisma, otherChurch);
    await prisma.branch.createMany({
      data: [
        { id: branch, church_id: church, name: 'Branch A' },
        { id: otherBranch, church_id: church, name: 'Branch B' },
      ],
    });
    await prisma.member.createMany({
      data: [
        { id: head, church_id: church, branch_id: branch, first_name: 'Head', last_name: 'A' },
        {
          id: otherHead,
          church_id: church,
          branch_id: otherBranch,
          first_name: 'Head',
          last_name: 'B',
        },
        {
          id: attendee,
          church_id: church,
          branch_id: branch,
          first_name: 'Member',
          last_name: 'A',
        },
      ],
    });
    await prisma.department.createMany({
      data: [
        {
          id: department,
          church_id: church,
          branch_id: branch,
          head_member_id: head,
          name: 'Choir',
        },
        {
          id: otherDepartment,
          church_id: church,
          branch_id: otherBranch,
          head_member_id: otherHead,
          name: 'Ushers',
        },
      ],
    });
    await prisma.departmentMember.create({
      data: { department_id: department, member_id: attendee },
    });
  });
  afterAll(async () => {
    await prisma.departmentMember.deleteMany({ where: { department: { church_id: church } } });
    await prisma.department.deleteMany({ where: { church_id: church } });
    await prisma.cellGroup.deleteMany({ where: { church_id: church } });
    await prisma.member.deleteMany({ where: { church_id: church } });
    await prisma.branch.deleteMany({ where: { church_id: church } });
    await prisma.auditLog.deleteMany({ where: { church_id: { in: [church, otherChurch] } } });
    await prisma.church.deleteMany({ where: { id: { in: [church, otherChurch] } } });
    await prisma.$disconnect();
  });
  it('upserts one member/date record even under concurrent writes', async () => {
    await Promise.all([
      service.recordDepartmentAttendance(department, input, church, randomUUID(), viewer),
      service.recordDepartmentAttendance(department, input, church, randomUUID(), viewer),
    ]);
    expect(await prisma.departmentAttendance.count({ where: { department_id: department } })).toBe(
      1,
    );
    await service.recordDepartmentAttendance(
      department,
      { ...input, status: 'late' },
      church,
      randomUUID(),
      viewer,
    );
    expect(
      (await service.listDepartmentAttendance(department, church, input.meetingDate, viewer))[0]
        .status,
    ).toBe('late');
  });
  it('supports visitors and date filtering', async () => {
    await service.recordDepartmentAttendance(
      department,
      { visitorName: 'Guest A', meetingDate: '2026-10-18', status: 'present' },
      church,
      randomUUID(),
      viewer,
    );
    const rows = await service.listDepartmentAttendance(department, church, '2026-10-18', viewer);
    expect(rows).toHaveLength(1);
    expect(rows[0].visitorName).toBe('Guest A');
  });
  it('keeps branch readers restricted and HQ readers church-wide', async () => {
    await expect(
      service.listDepartmentAttendance(otherDepartment, church, undefined, viewer),
    ).rejects.toThrow('not found');
    expect(
      await service.listDepartmentAttendance(otherDepartment, church, undefined, {
        ...viewer,
        is_admin_hq: true,
      }),
    ).toEqual([]);
    await expect(
      service.listDepartmentAttendance(department, otherChurch, undefined, {
        ...viewer,
        church_id: otherChurch,
        is_admin_hq: true,
      }),
    ).rejects.toThrow('not found');
  });
  it('HQ does not grant writes to departments the head does not lead', async () => {
    await expect(
      service.recordDepartmentAttendance(otherDepartment, input, church, randomUUID(), {
        ...viewer,
        is_admin_hq: true,
      }),
    ).rejects.toThrow('own department');
    expect(
      await prisma.departmentAttendance.count({ where: { department_id: otherDepartment } }),
    ).toBe(0);
  });
  it('rejects out-of-department members and invalid dates without persisting data', async () => {
    for (const invalid of [
      { ...input, memberId: otherHead },
      { ...input, meetingDate: '2026-02-30' },
    ])
      await expect(
        service.recordDepartmentAttendance(department, invalid, church, randomUUID(), viewer),
      ).rejects.toThrow();
    expect(await prisma.departmentAttendance.count({ where: { department_id: department } })).toBe(
      2,
    );
  });
  it('HQ heads and leaders can create branch-assigned departments/groups, without creating across tenants', async () => {
    const created = await service.createDepartment(
      { name: 'New Department', branchId: otherBranch, headMemberId: otherHead },
      church,
      randomUUID(),
      { ...viewer, is_admin_hq: true },
    );
    expect(created.branchId).toBe(otherBranch);
    const group = await service.createCellGroup(
      { name: 'New Group', branchId: otherBranch, leaderId: otherHead },
      church,
      randomUUID(),
      {
        ...viewer,
        role: 'cell_leader',
        permissions: ['cell_groups:own:update'],
        is_admin_hq: true,
      },
    );
    expect(group.branchId).toBe(otherBranch);
    await expect(
      service.createDepartment(
        { name: 'Tenant violation', branchId: otherBranch },
        otherChurch,
        randomUUID(),
        { ...viewer, church_id: otherChurch, is_admin_hq: true },
      ),
    ).rejects.toThrow('not found');
  });
  it('rejects raw attendance rows with no attendee', async () => {
    await expect(
      prisma.departmentAttendance.create({
        data: {
          department_id: department,
          meeting_date: new Date(input.meetingDate),
          status: 'present',
        },
      }),
    ).rejects.toThrow();
  });
});
