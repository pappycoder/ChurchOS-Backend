import { ValidationPipe } from '@nestjs/common';
import { AdminService } from '../../../src/admin/admin.service';
import { BulkMeetingAttendanceDto } from '../../../src/admin/dto/bulk-meeting-attendance.dto';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { BranchScopeService } from '../../../src/common/services/branch-scope.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

describe('Meeting attendance roster', () => {
  const input = {
    memberIds: ['member-a', 'member-b'],
    meetingDate: '2026-10-18',
    status: 'present',
  };
  const viewer = {
    role: 'custom',
    church_id: 'church-a',
    branch_id: 'branch-a',
    member_id: 'owner',
    permissions: ['departments:own:update', 'cell_groups:own:update'],
  };
  let prisma: ReturnType<typeof createPrismaMock>, service: AdminService;
  beforeEach(() => {
    prisma = createPrismaMock();
    const context = new RequestContextService();
    service = new AdminService(
      prisma as never,
      context,
      { log: jest.fn() } as never,
      new BranchScopeService(context),
    );
    jest
      .spyOn(service, 'getDepartmentById')
      .mockResolvedValue({ id: 'parent', branchId: 'branch-a', headMemberId: 'owner' } as never);
    jest
      .spyOn(service, 'getCellGroupById')
      .mockResolvedValue({ id: 'parent', branchId: 'branch-a', leaderId: 'owner' } as never);
    prisma.departmentMember.findMany.mockResolvedValue(
      input.memberIds.map((member_id) => ({ member_id })),
    );
    prisma.cellGroupMember.findMany.mockResolvedValue(
      input.memberIds.map((member_id) => ({ member_id })),
    );
  });
  for (const type of ['department', 'cell_group'] as const) {
    const table = type === 'department' ? 'departmentAttendance' : 'cellGroupAttendance';
    it(`${type}: validates membership once and saves the whole roster transactionally`, async () => {
      expect(
        await service.recordMeetingRoster(type, 'parent', input, 'church-a', 'user', viewer),
      ).toEqual({ recorded: 2 });
      expect(prisma[table].createMany).toHaveBeenCalledTimes(1);
      expect(prisma[table].updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const membership = type === 'department' ? prisma.departmentMember : prisma.cellGroupMember;
      expect(membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            member: { id: { in: input.memberIds }, church_id: 'church-a', branch_id: 'branch-a' },
          }),
        }),
      );
    });
    it(`${type}: rejects an out-of-roster selection before any writes`, async () => {
      prisma.departmentMember.findMany.mockResolvedValue([{ member_id: 'member-a' }]);
      prisma.cellGroupMember.findMany.mockResolvedValue([{ member_id: 'member-a' }]);
      await expect(
        service.recordMeetingRoster(type, 'parent', input, 'church-a', 'user', viewer),
      ).rejects.toThrow('outside this meeting roster');
      expect(prisma[table].createMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it.each([false, true])(
      `${type}: rejects non-owner writes even with HQ=%s`,
      async (is_admin_hq) => {
        await expect(
          service.recordMeetingRoster(type, 'parent', input, 'church-a', 'user', {
            ...viewer,
            member_id: 'another',
            is_admin_hq,
          }),
        ).rejects.toThrow('own');
        expect(prisma[table].createMany).not.toHaveBeenCalled();
      },
    );
    it(`${type}: rejects archived parents`, async () => {
      jest
        .spyOn(service, type === 'department' ? 'getDepartmentById' : 'getCellGroupById')
        .mockResolvedValue({ archivedAt: '2026-10-18' } as never);
      await expect(
        service.recordMeetingRoster(type, 'parent', input, 'church-a', 'user', viewer),
      ).rejects.toThrow('archived');
    });
  }
  it.each(['2026-02-30', 'invalid'])('rejects invalid calendar date %s', async (meetingDate) => {
    await expect(
      service.recordMeetingRoster(
        'department',
        'parent',
        { ...input, meetingDate },
        'church-a',
        'user',
        viewer,
      ),
    ).rejects.toThrow('valid meeting date');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('validates empty, duplicate, invalid and oversized member selections at the API boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    for (const memberIds of [
      [],
      [uuid, uuid],
      ['invalid'],
      Array.from(
        { length: 201 },
        (_, i) => `${i.toString(16).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      ),
    ]) {
      await expect(
        pipe.transform(
          { ...input, memberIds },
          { type: 'body', metatype: BulkMeetingAttendanceDto },
        ),
      ).rejects.toThrow();
    }
  });
});
