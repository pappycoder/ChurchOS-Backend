import { validate } from 'class-validator';
import { AttendanceService } from '../../../src/attendance/attendance.service';
import {
  GeneralAttendanceCountsDto,
  validateGeneralCounts,
} from '../../../src/attendance/dto/general-attendance.dto';
import {
  CreateServiceDto,
  defaultAttendanceCategory,
} from '../../../src/attendance/dto/create-service.dto';
import { RecordAttendanceDto } from '../../../src/attendance/dto/record-attendance.dto';
import { AttendanceController } from '../../../src/attendance/attendance.controller';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { BranchScopeService, ViewerScope } from '../../../src/common/services/branch-scope.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';
import { summarizeGeneralAttendance } from '../../../src/attendance/general-attendance-summary';

describe('General attendance and mixed services', () => {
  const church = 'church-a',
    branch = 'branch-a';
  const viewer: ViewerScope = { church_id: church, branch_id: branch, role: 'staff' };
  let prisma: ReturnType<typeof createPrismaMock>, service: AttendanceService;
  const input = { serviceId: 'service-a', attendanceDate: '2026-10-18', total: 100 };
  const row = {
    id: 'record-a',
    church_id: church,
    branch_id: branch,
    service_id: input.serviceId,
    attendance_date: new Date(input.attendanceDate),
    total: 100,
    adult_count: null,
    children_count: null,
    male_count: null,
    female_count: null,
  };
  beforeEach(() => {
    prisma = createPrismaMock();
    const context = new RequestContextService();
    service = new AttendanceService(
      prisma as never,
      context,
      { log: jest.fn() } as never,
      new BranchScopeService(context),
    );
    prisma.service.findFirst.mockResolvedValue({
      id: input.serviceId,
      church_id: church,
      branch_id: branch,
      is_active: true,
      category: 'mixed',
    });
    prisma.branch.findFirst.mockResolvedValue({ id: branch });
    prisma.attendanceSession.create.mockResolvedValue(row);
    prisma.attendanceSession.findFirst.mockResolvedValue(row);
    prisma.attendanceSession.update.mockResolvedValue(row);
  });
  it('accepts mixed service DTOs but never assigns mixed to an individual', async () => {
    expect(
      await validate(
        Object.assign(new CreateServiceDto(), { name: 'Mixed service', category: 'mixed' }),
      ),
    ).toEqual([]);
    expect(defaultAttendanceCategory('mixed')).toBe('unspecified');
    expect(defaultAttendanceCategory('children')).toBe('children');
    expect(defaultAttendanceCategory(null)).toBe('adult');
    expect(
      (
        await validate(
          Object.assign(new RecordAttendanceDto(), {
            serviceId: '00000000-0000-4000-8000-000000000001',
            visitorName: 'Guest',
            category: 'mixed',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { total: 0 },
    { total: 100 },
    { total: 100, adultCount: 60 },
    { total: 100, adultCount: 60, childrenCount: 40, maleCount: 50, femaleCount: 50 },
    { total: 100, childrenCount: 0 },
  ])('accepts partial and overlapping breakdowns %j', (counts) => {
    expect(() => validateGeneralCounts(counts)).not.toThrow();
  });
  it.each([
    { total: -1 },
    { total: 1.5 },
    { total: 2147483648 },
    { total: 10, adultCount: 11 },
    { total: 10, adultCount: 8, childrenCount: 3 },
    { total: 10, maleCount: 8, femaleCount: 3 },
    { total: 10, femaleCount: -1 },
    {},
  ])('rejects invalid counts %j', (counts) => {
    expect(() => validateGeneralCounts(counts as GeneralAttendanceCountsDto)).toThrow();
  });
  it('preserves optional blanks separately from zero', async () => {
    await service.recordGeneralAttendance({ ...input, childrenCount: 0 }, church, 'user', viewer);
    expect(prisma.attendanceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adult_count: null,
          children_count: 0,
          total: 100,
          branch_id: branch,
        }),
      }),
    );
  });
  it('rejects duplicate creation instead of editing through a create-only grant', async () => {
    prisma.attendanceSession.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.recordGeneralAttendance(input, church, 'user', viewer)).rejects.toThrow(
      'already recorded',
    );
    expect(prisma.attendanceSession.update).not.toHaveBeenCalled();
  });
  it('rejects invisible services, foreign branches, and invalid dates', async () => {
    prisma.service.findFirst.mockResolvedValueOnce(null);
    await expect(service.recordGeneralAttendance(input, church, 'user', viewer)).rejects.toThrow(
      'not found',
    );
    await expect(
      service.recordGeneralAttendance({ ...input, branchId: 'branch-b' }, church, 'user', viewer),
    ).rejects.toThrow('meeting branch');
    await expect(
      service.recordGeneralAttendance(
        { ...input, attendanceDate: '2026-02-30' },
        church,
        'user',
        viewer,
      ),
    ).rejects.toThrow('valid attendance date');
    expect(prisma.attendanceSession.create).not.toHaveBeenCalled();
  });
  it('forces branch scope on reads and updates, and keeps HQ inside the church', async () => {
    prisma.attendanceSession.findMany.mockResolvedValue([]);
    prisma.attendanceSession.count.mockResolvedValue(0);
    await service.listGeneralAttendance(church, { branchId: 'branch-b' }, viewer);
    expect(prisma.attendanceSession.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { church_id: church, branch_id: branch, service_id: { not: null } },
      }),
    );
    await service.listGeneralAttendance(church, {}, { ...viewer, is_admin_hq: true });
    expect(prisma.attendanceSession.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { church_id: church, service_id: { not: null } } }),
    );
    prisma.attendanceSession.findFirst.mockResolvedValue(null);
    await expect(
      service.updateGeneralAttendance('record-b', { total: 1 }, church, 'user', viewer),
    ).rejects.toThrow('not found');
    expect(prisma.attendanceSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'record-b', church_id: church, branch_id: branch, service_id: { not: null } },
    });
    await expect(service.listGeneralAttendance('foreign-church', {}, viewer)).rejects.toThrow(
      'Invalid church',
    );
  });
  it('counts unspecified portions without double-counting age and gender totals', async () => {
    prisma.attendanceSession.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { total: 100, adult_count: 60, children_count: 10, male_count: 40, female_count: 20 },
    });
    expect(await summarizeGeneralAttendance(prisma as never, { church_id: church })).toEqual({
      reportCount: 2,
      total: 100,
      adultCount: 60,
      childrenCount: 10,
      maleCount: 40,
      femaleCount: 20,
      unspecifiedAgeCount: 30,
      unspecifiedGenderCount: 40,
    });
  });
  it('uses independent existing permission grants on each endpoint', () => {
    for (const [method, permission] of [
      ['recordGeneralAttendance', 'attendance:checkin:create'],
      ['listGeneralAttendance', 'attendance:records:read'],
      ['generalAttendanceSummary', 'attendance:reports:read'],
      ['updateGeneralAttendance', 'attendance:records:update'],
    ] as const) {
      expect(Reflect.getMetadata('permissions', AttendanceController.prototype[method])).toEqual([
        permission,
      ]);
    }
  });
});
