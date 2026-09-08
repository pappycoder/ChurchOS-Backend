/**
 * @file Regression guards for AssetsController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. All asset routes must carry granular surface
 * permissions (assets:list:*, assets:categories:*, assets:maintenance:*,
 * assets:loans:*) so the frontend permission gates match the server's
 * enforcement layer, while the per-endpoint role ceilings are preserved
 * weight-for-weight (write ceilings stay on the write routes; the
 * delete/depreciation ceiling of church_admin+treasurer is untouched).
 *
 * Asserted against the source text to avoid pulling the controllers'
 * transitive ESM-only dependencies into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const ASSETS_CONTROLLER_PATH = path.join(__dirname, '../../../src/assets/assets.controller.ts');

describe('AssetsController permission decorators', () => {
  const source = fs.readFileSync(ASSETS_CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  it('covers all 25 routes with a granular surface permission (reads 9, creates 5, updates 9, deletes 2)', () => {
    const readCount =
      (source.match(/@RequirePermissions\('assets:list:read'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:categories:read'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:maintenance:read'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:loans:read'\)/g)?.length ?? 0);
    const createCount =
      (source.match(/@RequirePermissions\('assets:list:create'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:categories:create'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:maintenance:create'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:loans:create'\)/g)?.length ?? 0);
    const updateCount =
      (source.match(/@RequirePermissions\('assets:list:update'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:categories:update'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:maintenance:update'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:loans:update'\)/g)?.length ?? 0);
    const deleteCount =
      (source.match(/@RequirePermissions\('assets:list:delete'\)/g)?.length ?? 0) +
      (source.match(/@RequirePermissions\('assets:categories:delete'\)/g)?.length ?? 0);
    expect(readCount).toBe(9);
    expect(createCount).toBe(5);
    expect(updateCount).toBe(9);
    expect(deleteCount).toBe(2);
  });

  it('requires the import from permissions.decorator', () => {
    expect(source).toContain(
      "import { RequirePermissions } from '../auth/decorators/permissions.decorator';",
    );
  });

  it('requires assets:list:read on GET /assets (list)', () => {
    const block = blockBetween('@Get()', 'async listAssets(');
    expect(block).toContain("@RequirePermissions('assets:list:read')");
  });

  it('requires assets:categories:read on GET /assets/categories (list)', () => {
    const block = blockBetween('async createCategory(\n', 'async listCategories(');
    expect(block).toContain("@Get('categories')");
    expect(block).toContain("@RequirePermissions('assets:categories:read')");
  });

  it('requires assets:list:read on GET /assets/:assetId', () => {
    const block = blockBetween("@Get(':assetId')", 'async getAsset(');
    expect(block).toContain("@RequirePermissions('assets:list:read')");
  });

  it('requires assets:list:read on GET /assets/:assetId/qr', () => {
    const block = blockBetween("@Get(':assetId/qr')", 'async getQr(');
    expect(block).toContain("@RequirePermissions('assets:list:read')");
  });

  it('requires assets:list:read on POST /assets/scan', () => {
    const block = blockBetween("@Post('scan')", 'async scanAsset(');
    expect(block).toContain("@RequirePermissions('assets:list:read')");
  });

  it('requires assets:maintenance:read on GET /assets/:assetId/maintenance', () => {
    const block = blockBetween("@Get(':assetId/maintenance')", 'async listMaintenance(');
    expect(block).toContain("@RequirePermissions('assets:maintenance:read')");
  });

  it('requires assets:list:read on GET /assets/:assetId/depreciation', () => {
    const block = blockBetween("@Get(':assetId/depreciation')\n", 'async listDepreciation(');
    expect(block).toContain("@RequirePermissions('assets:list:read')");
  });

  it('requires assets:list:read on GET /assets/:assetId/depreciation/summary', () => {
    const block = blockBetween(
      "@Get(':assetId/depreciation/summary')",
      'async getDepreciationSummary(',
    );
    expect(block).toContain("@RequirePermissions('assets:list:read')");
  });

  it('requires assets:loans:read on GET /assets/:assetId/loans', () => {
    const block = blockBetween("@Get(':assetId/loans')", 'async listLoans(');
    expect(block).toContain("@RequirePermissions('assets:loans:read')");
  });

  it('requires assets:list:create on POST /assets (keeps write-role ceiling)', () => {
    const block = blockBetween('@Post()', 'async createAsset(');
    expect(block).toContain("@RequirePermissions('assets:list:create')");
    expect(block).toContain('@UseGuards(RolesGuard)');
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:categories:create on POST /assets/categories', () => {
    const block = blockBetween("@Post('categories')", 'async createCategory(');
    expect(block).toContain("@RequirePermissions('assets:categories:create')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:list:create on POST /assets/:assetId/qr', () => {
    const block = blockBetween("@Post(':assetId/qr')", 'async generateQr(');
    expect(block).toContain("@RequirePermissions('assets:list:create')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:maintenance:create on POST /assets/:assetId/maintenance', () => {
    const block = blockBetween("@Post(':assetId/maintenance')", 'async createMaintenance(');
    expect(block).toContain("@RequirePermissions('assets:maintenance:create')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:loans:create on POST /assets/:assetId/loans', () => {
    const block = blockBetween("@Post(':assetId/loans')", 'async createLoan(');
    expect(block).toContain("@RequirePermissions('assets:loans:create')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:list:update on PATCH /assets/:assetId', () => {
    const block = blockBetween("@Patch(':assetId')", 'async updateAsset(');
    expect(block).toContain("@RequirePermissions('assets:list:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:categories:update on PATCH /assets/categories/:categoryId', () => {
    const block = blockBetween("@Patch('categories/:categoryId')", 'async updateCategory(');
    expect(block).toContain("@RequirePermissions('assets:categories:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:maintenance:update on PATCH /assets/:assetId/maintenance/:maintenanceId', () => {
    const block = blockBetween(
      "@Patch(':assetId/maintenance/:maintenanceId')",
      'async updateMaintenance(',
    );
    expect(block).toContain("@RequirePermissions('assets:maintenance:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:loans:update on PATCH /assets/:assetId/loans/:loanId/return', () => {
    const block = blockBetween("@Patch(':assetId/loans/:loanId/return')", 'async returnLoan(');
    expect(block).toContain("@RequirePermissions('assets:loans:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:list:update on POST /assets/:assetId/depreciation (keeps admin/treasurer ceiling)', () => {
    const block = blockBetween("@Post(':assetId/depreciation')", 'async createDepreciation(');
    expect(block).toContain("@RequirePermissions('assets:list:update')");
    expect(block).toContain("@RequireRoles('church_admin', 'treasurer')");
  });

  it('requires assets:list:delete on DELETE /assets/:assetId (keeps admin/treasurer ceiling)', () => {
    const block = blockBetween("@Delete(':assetId')", 'async deleteAsset(');
    expect(block).toContain("@RequirePermissions('assets:list:delete')");
    expect(block).toContain("@RequireRoles('church_admin', 'treasurer')");
  });

  it('requires assets:categories:delete on DELETE /assets/categories/:categoryId (keeps admin/treasurer ceiling)', () => {
    const block = blockBetween("@Delete('categories/:categoryId')", 'async deleteCategory(');
    expect(block).toContain("@RequirePermissions('assets:categories:delete')");
    expect(block).toContain("@RequireRoles('church_admin', 'treasurer')");
  });

  it('requires assets:list:update on POST /assets/:assetId/archive', () => {
    const block = blockBetween("@Post(':assetId/archive')", 'async archiveAsset(');
    expect(block).toContain("@RequirePermissions('assets:list:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });

  it('requires assets:list:update on POST /assets/:assetId/restore', () => {
    const block = blockBetween("@Post(':assetId/restore')", 'async restoreAsset(');
    expect(block).toContain("@RequirePermissions('assets:list:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });

  it('requires assets:categories:update on POST /assets/categories/:categoryId/archive', () => {
    const block = blockBetween("@Post('categories/:categoryId/archive')", 'async archiveCategory(');
    expect(block).toContain("@RequirePermissions('assets:categories:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });

  it('requires assets:categories:update on POST /assets/categories/:categoryId/restore', () => {
    const block = blockBetween("@Post('categories/:categoryId/restore')", 'async restoreCategory(');
    expect(block).toContain("@RequirePermissions('assets:categories:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });
});