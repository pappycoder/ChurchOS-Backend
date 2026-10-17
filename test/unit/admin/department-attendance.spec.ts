import { AdminService } from '../../../src/admin/admin.service';
import { BranchScopeService, ViewerScope } from '../../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';
import { DepartmentResponseDto } from '../../../src/admin/dto/admin-response.dto';

describe('Department meeting attendance scope', () => {
  const churchId = 'church-a';
  const departmentId = 'department-a';
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AdminService;
  const viewer: ViewerScope = {
    church_id: churchId,
    role: 'department_head',
    member_id: 'member-a',
    branch_id: 'branch-a',
    permissions: [
      'departments:read',
      'departments:own:read',
      'departments:own:update',
      'departments:update',
    ],
  };
  const input = { memberId: 'attendee-a', meetingDate: '2026-10-17', status: 'present' };
  beforeEach(() => {
    prisma = createPrismaMock();
    const context = new RequestContextService();
    service = new AdminService(
      prisma as never,
      context,
      { log: jest.fn() } as never,
      new BranchScopeService(context),
    );
    jest.spyOn(service, 'getDepartmentById').mockResolvedValue({
      id: departmentId,
      churchId,
      headMemberId: 'member-a',
      branchId: 'branch-a',
    } as DepartmentResponseDto);
    prisma.departmentMember.findFirst.mockResolvedValue({ id: 'membership-a' });
    prisma.departmentAttendance.upsert.mockResolvedValue({ id: 'attendance-a' });
    prisma.departmentAttendance.create.mockResolvedValue({ id: 'attendance-a' });
  });
  it.each([false, true])(
    'allows a head to record in the department they head (HQ=%s)',
    async (hq) => {
      await service.recordDepartmentAttendance(departmentId, input, churchId, 'user-a', {
        ...viewer,
        is_admin_hq: hq,
      });
      expect(prisma.departmentAttendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            department_id_member_id_meeting_date: {
              department_id: departmentId,
              member_id: input.memberId,
              meeting_date: new Date(input.meetingDate),
            },
          },
        }),
      );
    },
  );
  it.each([false, true])(
    'prevents heads recording in another department despite HQ=%s',
    async (hq) => {
      await expect(
        service.recordDepartmentAttendance(departmentId, input, churchId, 'user-a', {
          ...viewer,
          member_id: 'other-head',
          is_admin_hq: hq,
        }),
      ).rejects.toThrow('own department');
      expect(prisma.departmentAttendance.upsert).not.toHaveBeenCalled();
    },
  );
  it('rejects a member outside the department/church/branch', async () => {
    prisma.departmentMember.findFirst.mockResolvedValue(null);
    await expect(
      service.recordDepartmentAttendance(departmentId, input, churchId, 'user-a', viewer),
    ).rejects.toThrow('Department member not found');
    expect(prisma.departmentMember.findFirst).toHaveBeenCalledWith({
      where: {
        department_id: departmentId,
        member_id: input.memberId,
        member: { church_id: churchId, branch_id: 'branch-a' },
      },
    });
  });
  it.each(['2026-02-30', 'not-a-date'])('rejects invalid meeting date %s', async (meetingDate) => {
    await expect(
      service.recordDepartmentAttendance(
        departmentId,
        { ...input, meetingDate },
        churchId,
        'user-a',
        viewer,
      ),
    ).rejects.toThrow('valid meeting date');
  });
  it('validates parent visibility before reading or writing attendance', async () => {
    jest.spyOn(service, 'getDepartmentById').mockRejectedValue(new Error('not visible'));
    await expect(
      service.listDepartmentAttendance(departmentId, churchId, undefined, viewer),
    ).rejects.toThrow('not visible');
    await expect(
      service.recordDepartmentAttendance(departmentId, input, churchId, 'user-a', viewer),
    ).rejects.toThrow('not visible');
    expect(prisma.departmentAttendance.findMany).not.toHaveBeenCalled();
    expect(prisma.departmentAttendance.upsert).not.toHaveBeenCalled();
  });
  it('keeps attendance queries filtered to the scoped parent and date', async () => {
    prisma.departmentAttendance.findMany.mockResolvedValue([]);
    await service.listDepartmentAttendance(departmentId, churchId, input.meetingDate, {
      ...viewer,
      is_admin_hq: true,
    });
    expect(service.getDepartmentById).toHaveBeenCalledWith(
      departmentId,
      churchId,
      expect.objectContaining({ is_admin_hq: true }),
    );
    expect(prisma.departmentAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { department_id: departmentId, meeting_date: new Date(input.meetingDate) },
      }),
    );
  });
  it('records a visitor without granting member administration access', async () => {
    await service.recordDepartmentAttendance(
      departmentId,
      { visitorName: 'Guest One', meetingDate: input.meetingDate, status: 'late' },
      churchId,
      'user-a',
      viewer,
    );
    expect(prisma.departmentAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visitor_name: 'Guest One', member_id: null }),
      }),
    );
  });
  it.each(['cell_groups', 'departments'])(
    'non-HQ own-scope users cannot create new %s',
    async (resource) => {
      const actor = { ...viewer, permissions: [`${resource}:own:update`] };
      const operation =
        resource === 'cell_groups'
          ? service.createCellGroup(
              { name: 'New', branchId: 'branch-a' },
              churchId,
              'user-a',
              actor,
            )
          : service.createDepartment(
              { name: 'New', branchId: 'branch-a' },
              churchId,
              'user-a',
              actor,
            );
      await expect(operation).rejects.toThrow('HQ scope');
    },
  );
});
