import { DEFAULT_PERMISSION_MATRIX } from '../../../prisma/seeds/shared/permissions.seed';
import { PERMISSIONS_KEY } from '../../../src/auth/decorators/permissions.decorator';
import { AdminController } from '../../../src/admin/admin.controller';
import { GivingController } from '../../../src/giving/giving.controller';

describe('Cell group giving permissions', () => {
  it('allows treasurers to view group giving without full details or edits', () => {
    expect(DEFAULT_PERMISSION_MATRIX.treasurer).toEqual(
      expect.arrayContaining(['cell_groups:read', 'cell_groups:giving:read']),
    );
    for (const permission of [
      'cell_groups:details:read',
      'cell_groups:create',
      'cell_groups:update',
      'cell_groups:delete',
      'cell_groups:giving:create',
    ])
      expect(DEFAULT_PERMISSION_MATRIX.treasurer).not.toContain(permission);
  });
  it('allows ushers full group reading without editing or recording giving', () => {
    expect(DEFAULT_PERMISSION_MATRIX.usher).toEqual(
      expect.arrayContaining([
        'cell_groups:read',
        'cell_groups:details:read',
        'cell_groups:giving:read',
      ]),
    );
    for (const permission of [
      'cell_groups:create',
      'cell_groups:update',
      'cell_groups:delete',
      'cell_groups:giving:create',
    ])
      expect(DEFAULT_PERMISSION_MATRIX.usher).not.toContain(permission);
  });
  it('grants leaders scoped group giving access without general giving management', () => {
    expect(DEFAULT_PERMISSION_MATRIX.cell_leader).toEqual(
      expect.arrayContaining([
        'cell_groups:own:read',
        'cell_groups:giving:create',
        'cell_groups:giving:read',
      ]),
    );
    expect(DEFAULT_PERMISSION_MATRIX.cell_leader).not.toContain('giving:records:create');
    expect(DEFAULT_PERMISSION_MATRIX.secretary).not.toContain('cell_groups:giving:read');
  });
  it('protects member and attendance data with the full details permission', () => {
    for (const method of [
      AdminController.prototype.listCellGroupMembers,
      AdminController.prototype.listCellGroupAttendance,
      AdminController.prototype.getCellGroupAttendanceSummary,
    ])
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual(['cell_groups:details:read']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, GivingController.prototype.recordCellGroupGiving),
    ).toEqual(['cell_groups:giving:create']);
  });
});
