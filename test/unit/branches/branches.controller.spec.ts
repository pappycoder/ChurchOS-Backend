/**
 * @file Regression guards for BranchesController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. Every branch route must carry a granular
 * `branches:create/read/update/delete` so the frontend permission gates match
 * the server's enforcement layer (the web branch pages gate Archive/Delete on
 * `branches:delete` and Restore on `branches:update`), while the per-endpoint
 * role ceilings stay intact (writes church_admin+super_admin; reads add
 * branch_pastor+secretary).
 *
 * Asserted against the source text to avoid pulling the controller's
 * transitive ESM-only dependencies into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const BRANCHES_CONTROLLER_PATH = path.join(
  __dirname,
  '../../../src/branches/branches.controller.ts',
);

describe('BranchesController permission decorators', () => {
  const source = fs.readFileSync(BRANCHES_CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  it('covers all 7 routes with a granular branches permission (2 read, 3 create-ish update spread, 1 create, 1 delete)', () => {
    const readCount = source.match(/@RequirePermissions\('branches:read'\)/g)?.length ?? 0;
    const createCount = source.match(/@RequirePermissions\('branches:create'\)/g)?.length ?? 0;
    const updateCount = source.match(/@RequirePermissions\('branches:update'\)/g)?.length ?? 0;
    const deleteCount = source.match(/@RequirePermissions\('branches:delete'\)/g)?.length ?? 0;
    expect(readCount).toBe(2);
    expect(createCount).toBe(1);
    expect(updateCount).toBe(3);
    expect(deleteCount).toBe(1);
  });

  it('requires the import from permissions.decorator', () => {
    expect(source).toContain(
      "import { RequirePermissions } from '../auth/decorators/permissions.decorator';",
    );
  });

  it('requires branches:create on POST /branches (keeps church_admin/super_admin ceiling)', () => {
    const block = blockBetween('@Post()', 'async create(');
    expect(block).toContain("@RequirePermissions('branches:create')");
    expect(block).toContain("@RequireRoles('church_admin', 'super_admin')");
  });

  it('requires branches:read on GET /branches (keeps branch_pastor/secretary read ceiling)', () => {
    const block = blockBetween('@Get()', 'async findAll(');
    expect(block).toContain("@RequirePermissions('branches:read')");
    expect(block).toContain(
      "@RequireRoles('church_admin', 'super_admin', 'branch_pastor', 'secretary')",
    );
  });

  it('requires branches:read on GET /branches/:branchId (keeps branch_pastor/secretary read ceiling)', () => {
    const block = blockBetween("@Get(':branchId')", 'async findOne(');
    expect(block).toContain("@RequirePermissions('branches:read')");
    expect(block).toContain(
      "@RequireRoles('church_admin', 'super_admin', 'branch_pastor', 'secretary')",
    );
  });

  it('requires branches:update on PATCH /branches/:branchId (keeps church_admin/super_admin ceiling)', () => {
    const block = blockBetween("@Patch(':branchId')", 'async update(');
    expect(block).toContain("@RequirePermissions('branches:update')");
    expect(block).toContain("@RequireRoles('church_admin', 'super_admin')");
  });

  it('requires branches:delete on DELETE /branches/:branchId (keeps church_admin/super_admin ceiling)', () => {
    const block = blockBetween("@Delete(':branchId')", 'async remove(');
    expect(block).toContain("@RequirePermissions('branches:delete')");
    expect(block).toContain("@RequireRoles('church_admin', 'super_admin')");
  });

  it('requires branches:update on POST /branches/:branchId/archive', () => {
    const block = blockBetween("@Post(':branchId/archive')", 'async archive(');
    expect(block).toContain("@RequirePermissions('branches:update')");
    expect(block).toContain("@RequireRoles('church_admin', 'super_admin')");
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });

  it('requires branches:update on POST /branches/:branchId/restore', () => {
    const block = blockBetween("@Post(':branchId/restore')", 'async restore(');
    expect(block).toContain("@RequirePermissions('branches:update')");
    expect(block).toContain("@RequireRoles('church_admin', 'super_admin')");
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });
});
