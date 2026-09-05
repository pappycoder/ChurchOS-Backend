/**
 * @file Regression guards for AdminController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. Every department and cell-group route must carry a
 * granular permission so the frontend permission gates match the server's
 * enforcement layer, while each endpoint's role ceiling is preserved.
 *
 * `GET /admin/cell-groups/nearest` is deliberately left permission-free (it
 * serves members on mobile finding the nearest cell group and stays auth-only
 * — same precedent as sermon bookmarks and media uploads).
 *
 * Asserted against the source text to avoid pulling the controllers'
 * transitive ESM-only dependencies into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const ADMIN_CONTROLLER_PATH = path.join(__dirname, '../../../src/admin/admin.controller.ts');

describe('AdminController permission decorators', () => {
  const source = fs.readFileSync(ADMIN_CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  const collapse = (s: string): string => s.replace(/[\s,]/g, '');

  const hasRequireRoles = (block: string, roles: string): void => {
    expect(collapse(block)).toContain(collapse(`@RequireRoles(${roles})`));
  };

  it('covers all 23 department/cell-group routes with a granular permission', () => {
    const depCreate = source.match(/@RequirePermissions\('departments:create'\)/g)?.length ?? 0;
    const depRead = source.match(/@RequirePermissions\('departments:read'\)/g)?.length ?? 0;
    const depUpdate = source.match(/@RequirePermissions\('departments:update'\)/g)?.length ?? 0;
    const depDelete = source.match(/@RequirePermissions\('departments:delete'\)/g)?.length ?? 0;
    const cgCreate = source.match(/@RequirePermissions\('cell_groups:create'\)/g)?.length ?? 0;
    const cgRead = source.match(/@RequirePermissions\('cell_groups:read'\)/g)?.length ?? 0;
    const cgUpdate = source.match(/@RequirePermissions\('cell_groups:update'\)/g)?.length ?? 0;
    const cgDelete = source.match(/@RequirePermissions\('cell_groups:delete'\)/g)?.length ?? 0;
    expect(depCreate).toBe(1);
    expect(depRead).toBe(2);
    expect(depUpdate).toBe(5);
    expect(depDelete).toBe(1);
    expect(cgCreate).toBe(3);
    expect(cgRead).toBe(5);
    expect(cgUpdate).toBe(4);
    expect(cgDelete).toBe(1);
  });

  it('requires the import from permissions.decorator', () => {
    expect(source).toContain(
      "import { RequirePermissions } from '../auth/decorators/permissions.decorator';",
    );
  });

  // ─── Departments ───────────────────────────────

  it('requires departments:create on POST /admin/departments (keeps church_admin/senior_pastor ceiling)', () => {
    const block = blockBetween("@Post('departments')", 'async createDepartment(');
    expect(block).toContain("@RequirePermissions('departments:create')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor'");
  });

  it('requires departments:read on GET /admin/departments', () => {
    const block = blockBetween("@Get('departments')", 'async listDepartments(');
    expect(block).toContain("@RequirePermissions('departments:read')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor', 'branch_pastor'");
  });

  it('requires departments:read on GET /admin/departments/:departmentId', () => {
    const block = blockBetween("@Get('departments/:departmentId')", 'async getDepartmentById(');
    expect(block).toContain("@RequirePermissions('departments:read')");
  });

  it('requires departments:update on PATCH /admin/departments/:departmentId', () => {
    const block = blockBetween("@Patch('departments/:departmentId')", 'async updateDepartment(');
    expect(block).toContain("@RequirePermissions('departments:update')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor'");
  });

  it('requires departments:delete on DELETE /admin/departments/:departmentId (keeps church_admin ceiling)', () => {
    const block = blockBetween("@Delete('departments/:departmentId')", 'async deleteDepartment(');
    expect(block).toContain("@RequirePermissions('departments:delete')");
    hasRequireRoles(block, "'church_admin'");
  });

  it('requires departments:update on POST /admin/departments/:departmentId/members', () => {
    const block = blockBetween(
      "@Post('departments/:departmentId/members')",
      'async addDepartmentMember(',
    );
    expect(block).toContain("@RequirePermissions('departments:update')");
  });

  it('requires departments:update on DELETE /admin/departments/:departmentId/members/:memberId', () => {
    const block = blockBetween(
      "@Delete('departments/:departmentId/members/:memberId')",
      'async removeDepartmentMember(',
    );
    expect(block).toContain("@RequirePermissions('departments:update')");
  });

  it('requires departments:update on POST /admin/departments/:departmentId/archive', () => {
    const block = blockBetween(
      "@Post('departments/:departmentId/archive')",
      'async archiveDepartment(',
    );
    expect(block).toContain("@RequirePermissions('departments:update')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor'");
  });

  it('requires departments:update on POST /admin/departments/:departmentId/restore', () => {
    const block = blockBetween(
      "@Post('departments/:departmentId/restore')",
      'async restoreDepartment(',
    );
    expect(block).toContain("@RequirePermissions('departments:update')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor'");
  });

  // ─── Cell Groups ───────────────────────────────

  it('requires cell_groups:create on POST /admin/cell-groups', () => {
    const block = blockBetween("@Post('cell-groups')", 'async createCellGroup(');
    expect(block).toContain("@RequirePermissions('cell_groups:create')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor', 'branch_pastor'");
  });

  it('requires cell_groups:read on GET /admin/cell-groups with widened read roles', () => {
    const block = blockBetween("@Get('cell-groups')\n", 'async listCellGroups(');
    expect(block).toContain("@RequirePermissions('cell_groups:read')");
    hasRequireRoles(
      block,
      "'church_admin', 'senior_pastor', 'branch_pastor', 'department_head', 'cell_leader'",
    );
  });

  it('leaves GET /admin/cell-groups/nearest intentionally permission-free (member-facing)', () => {
    const block = blockBetween("@Get('cell-groups/nearest')", 'async findNearestGroups(');
    hasRequireRoles(block, "'church_admin', 'senior_pastor', 'branch_pastor', 'member'");
    expect(block).not.toContain("@RequirePermissions('cell_groups:read')");
  });

  it('requires cell_groups:read on GET /admin/cell-groups/:groupId with widened read roles', () => {
    const block = blockBetween("@Get('cell-groups/:groupId')", 'async getCellGroupById(');
    expect(block).toContain("@RequirePermissions('cell_groups:read')");
    hasRequireRoles(
      block,
      "'church_admin', 'senior_pastor', 'branch_pastor', 'department_head', 'cell_leader'",
    );
  });

  it('requires cell_groups:update on PATCH /admin/cell-groups/:groupId', () => {
    const block = blockBetween("@Patch('cell-groups/:groupId')", 'async updateCellGroup(');
    expect(block).toContain("@RequirePermissions('cell_groups:update')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor', 'branch_pastor'");
  });

  it('requires cell_groups:delete on DELETE /admin/cell-groups/:groupId', () => {
    const block = blockBetween("@Delete('cell-groups/:groupId')", 'async deleteCellGroup(');
    expect(block).toContain("@RequirePermissions('cell_groups:delete')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor'");
  });

  it('requires cell_groups:create on POST /admin/cell-groups/:groupId/members', () => {
    const block = blockBetween(
      "@Post('cell-groups/:groupId/members')",
      'async addCellGroupMember(',
    );
    expect(block).toContain("@RequirePermissions('cell_groups:create')");
  });

  it('requires cell_groups:update on DELETE /admin/cell-groups/:groupId/members/:memberId', () => {
    const block = blockBetween(
      "@Delete('cell-groups/:groupId/members/:memberId')",
      'async removeCellGroupMember(',
    );
    expect(block).toContain("@RequirePermissions('cell_groups:update')");
  });

  it('requires cell_groups:update on POST /admin/cell-groups/:groupId/archive', () => {
    const block = blockBetween("@Post('cell-groups/:groupId/archive')", 'async archiveCellGroup(');
    expect(block).toContain("@RequirePermissions('cell_groups:update')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor', 'branch_pastor'");
  });

  it('requires cell_groups:update on POST /admin/cell-groups/:groupId/restore', () => {
    const block = blockBetween("@Post('cell-groups/:groupId/restore')", 'async restoreCellGroup(');
    expect(block).toContain("@RequirePermissions('cell_groups:update')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor', 'branch_pastor'");
  });

  it('requires cell_groups:read on GET /admin/cell-groups/:groupId/members with widened read roles', () => {
    const block = blockBetween(
      "@Get('cell-groups/:groupId/members')",
      'async listCellGroupMembers(',
    );
    expect(block).toContain("@RequirePermissions('cell_groups:read')");
    hasRequireRoles(
      block,
      "'church_admin', 'senior_pastor', 'branch_pastor', 'department_head', 'cell_leader'",
    );
  });

  it('requires cell_groups:create on POST /admin/cell-groups/:groupId/attendance (keeps secretary recorder role)', () => {
    const block = blockBetween(
      "@Post('cell-groups/:groupId/attendance')",
      'async recordCellGroupAttendance(',
    );
    expect(block).toContain("@RequirePermissions('cell_groups:create')");
    hasRequireRoles(block, "'church_admin', 'senior_pastor', 'branch_pastor', 'secretary'");
  });

  it('requires cell_groups:read on GET /admin/cell-groups/:groupId/attendance with widened read roles', () => {
    const block = blockBetween(
      "@Get('cell-groups/:groupId/attendance')\n",
      'async listCellGroupAttendance(',
    );
    expect(block).toContain("@RequirePermissions('cell_groups:read')");
    hasRequireRoles(
      block,
      "'church_admin', 'senior_pastor', 'branch_pastor', 'secretary', 'department_head', 'cell_leader'",
    );
  });

  it('requires cell_groups:read on GET /admin/cell-groups/:groupId/attendance/summary with widened read roles', () => {
    const block = blockBetween(
      "@Get('cell-groups/:groupId/attendance/summary')",
      'async getCellGroupAttendanceSummary(',
    );
    expect(block).toContain("@RequirePermissions('cell_groups:read')");
    hasRequireRoles(
      block,
      "'church_admin', 'senior_pastor', 'branch_pastor', 'secretary', 'department_head', 'cell_leader'",
    );
  });
});
