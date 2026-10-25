import { VisitorsService } from '../../../src/visitors/visitors.service';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';
import { VisitorsController } from '../../../src/visitors/visitors.controller';
import { PERMISSIONS_KEY } from '../../../src/auth/decorators/permissions.decorator';
import { ViewerScope } from '../../../src/common/services/branch-scope.service';

describe('visitor bulk import', () => {
  let service: VisitorsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let create: jest.SpyInstance;
  const viewer = { church_id: 'church-a', is_admin_hq: true, branch_id: 'branch-a' } as ViewerScope;
  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-a' });
    prisma.visitor.findFirst.mockResolvedValue(null);
    service = new VisitorsService(
      prisma as never,
      { log: jest.fn() } as never,
      new RequestContextService(),
    );
    create = jest.spyOn(service, 'create').mockResolvedValue({ id: 'created' } as never);
  });
  it('reuses visitor creation permission for the bulk endpoint', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, VisitorsController.prototype.bulkImport)).toEqual([
      'visitors:new:create',
    ]);
  });
  it('validates without writes and imports supported fields with branch context', async () => {
    const records = [
      {
        firstName: 'Amina',
        phone: '+2348001234567',
        firstVisitDate: '2026-10-25',
        branchId: 'branch-a',
        notes: 'First visit',
      },
    ];
    const preview = await service.bulkImport(records, 'church-a', 'user-a', true, viewer);
    expect(preview).toEqual({ created: 1, errors: [], dryRun: true });
    expect(create).not.toHaveBeenCalled();
    const result = await service.bulkImport(records, 'church-a', 'user-a', false, viewer);
    expect(result.created).toBe(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining(records[0]),
      'church-a',
      'user-a',
      viewer,
    );
  });
  it('returns row errors for malformed data, unsupported columns and duplicate contacts', async () => {
    const result = await service.bulkImport(
      [
        { firstName: 'Amina', email: 'amina@example.com' },
        { firstName: 'Again', email: 'AMINA@example.com' },
        { firstName: ' ' },
        { firstName: 'Wrong', firstVisitDate: 'bad-date' },
        { firstName: 'State', followUpStatus: 'converted' } as never,
      ],
      'church-a',
      'user-a',
      true,
      viewer,
    );
    expect(result.created).toBe(1);
    expect(result.errors.map((error) => error.row)).toEqual([2, 3, 4, 5]);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects cross-branch and unknown church branches', async () => {
    const scoped = await service.bulkImport(
      [{ firstName: 'Amina', branchId: 'branch-b' }],
      'church-a',
      'user-a',
      false,
      { ...viewer, is_admin_hq: false },
    );
    expect(scoped.errors[0].message).toContain('your branch');
    prisma.branch.findFirst.mockResolvedValue(null);
    const hq = await service.bulkImport(
      [{ firstName: 'Amina', branchId: 'foreign-branch' }],
      'church-a',
      'user-a',
      true,
      viewer,
    );
    expect(hq.errors[0].message).toContain('Branch not found');
    expect(create).not.toHaveBeenCalled();
  });
  it('skips contacts already saved in this church', async () => {
    prisma.visitor.findFirst.mockResolvedValue({ id: 'existing' });
    const result = await service.bulkImport(
      [{ firstName: 'Amina', email: 'amina@example.com' }],
      'church-a',
      'user-a',
      false,
      viewer,
    );
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });
  it('reports a failed row and continues with the next visitor', async () => {
    create.mockRejectedValueOnce(new Error('Row failed'));
    const result = await service.bulkImport(
      [{ firstName: 'First' }, { firstName: 'Second' }],
      'church-a',
      'user-a',
      false,
      viewer,
    );
    expect(result.created).toBe(1);
    expect(result.errors).toEqual([{ row: 1, message: 'Row failed' }]);
  });
  it('bounds batch size and validates the dry-run flag', async () => {
    await expect(service.bulkImport([], 'church-a', 'user-a')).rejects.toThrow('1 and 100');
    await expect(
      service.bulkImport(Array(101).fill({ firstName: 'Amina' }), 'church-a', 'user-a'),
    ).rejects.toThrow('1 and 100');
    await expect(
      service.bulkImport([{ firstName: 'Amina' }], 'church-a', 'user-a', 'yes' as never),
    ).rejects.toThrow('boolean');
  });
});
