/**
 * @file Regression guards for AssetsController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. All asset routes must carry granular
 * `assets:read/create/update/delete` so the frontend permission gates match
 * the server's enforcement layer, while the per-endpoint role ceilings are
 * preserved weight-for-weight (write ceilings stay on the write routes; the
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

  it('covers all 25 routes with a granular assets permission (9 read, 5 create, 9 update, 2 delete)', () => {
    const readCount = source.match(/@RequirePermissions\('assets:read'\)/g)?.length ?? 0;
    const createCount = source.match(/@RequirePermissions\('assets:create'\)/g)?.length ?? 0;
    const updateCount = source.match(/@RequirePermissions\('assets:update'\)/g)?.length ?? 0;
    const deleteCount = source.match(/@RequirePermissions\('assets:delete'\)/g)?.length ?? 0;
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

  it('requires assets:read on GET /assets (list)', () => {
    const block = blockBetween('@Get()', 'async listAssets(');
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:read on GET /assets/categories (list)', () => {
    const block = blockBetween('async createCategory(\n', 'async listCategories(');
    expect(block).toContain("@Get('categories')");
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:read on GET /assets/:assetId', () => {
    const block = blockBetween("@Get(':assetId')", 'async getAsset(');
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:read on GET /assets/:assetId/qr', () => {
    const block = blockBetween("@Get(':assetId/qr')", 'async getQr(');
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:read on POST /assets/scan', () => {
    const block = blockBetween("@Post('scan')", 'async scanAsset(');
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:read on GET /assets/:assetId/maintenance', () => {
    const block = blockBetween("@Get(':assetId/maintenance')", 'async listMaintenance(');
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:read on GET /assets/:assetId/depreciation', () => {
    const block = blockBetween("@Get(':assetId/depreciation')\n", 'async listDepreciation(');
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:read on GET /assets/:assetId/depreciation/summary', () => {
    const block = blockBetween(
      "@Get(':assetId/depreciation/summary')",
      'async getDepreciationSummary(',
    );
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:read on GET /assets/:assetId/loans', () => {
    const block = blockBetween("@Get(':assetId/loans')", 'async listLoans(');
    expect(block).toContain("@RequirePermissions('assets:read')");
  });

  it('requires assets:create on POST /assets (keeps write-role ceiling)', () => {
    const block = blockBetween('@Post()', 'async createAsset(');
    expect(block).toContain("@RequirePermissions('assets:create')");
    expect(block).toContain('@UseGuards(RolesGuard)');
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:create on POST /assets/categories', () => {
    const block = blockBetween("@Post('categories')", 'async createCategory(');
    expect(block).toContain("@RequirePermissions('assets:create')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:create on POST /assets/:assetId/qr', () => {
    const block = blockBetween("@Post(':assetId/qr')", 'async generateQr(');
    expect(block).toContain("@RequirePermissions('assets:create')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:create on POST /assets/:assetId/maintenance', () => {
    const block = blockBetween("@Post(':assetId/maintenance')", 'async createMaintenance(');
    expect(block).toContain("@RequirePermissions('assets:create')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:create on POST /assets/:assetId/loans', () => {
    const block = blockBetween("@Post(':assetId/loans')", 'async createLoan(');
    expect(block).toContain("@RequirePermissions('assets:create')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:update on PATCH /assets/:assetId', () => {
    const block = blockBetween("@Patch(':assetId')", 'async updateAsset(');
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:update on PATCH /assets/categories/:categoryId', () => {
    const block = blockBetween("@Patch('categories/:categoryId')", 'async updateCategory(');
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:update on PATCH /assets/:assetId/maintenance/:maintenanceId', () => {
    const block = blockBetween(
      "@Patch(':assetId/maintenance/:maintenanceId')",
      'async updateMaintenance(',
    );
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:update on PATCH /assets/:assetId/loans/:loanId/return', () => {
    const block = blockBetween("@Patch(':assetId/loans/:loanId/return')", 'async returnLoan(');
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
  });

  it('requires assets:update on POST /assets/:assetId/depreciation (keeps admin/treasurer ceiling)', () => {
    const block = blockBetween("@Post(':assetId/depreciation')", 'async createDepreciation(');
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain("@RequireRoles('church_admin', 'treasurer')");
  });

  it('requires assets:delete on DELETE /assets/:assetId (keeps admin/treasurer ceiling)', () => {
    const block = blockBetween("@Delete(':assetId')", 'async deleteAsset(');
    expect(block).toContain("@RequirePermissions('assets:delete')");
    expect(block).toContain("@RequireRoles('church_admin', 'treasurer')");
  });

  it('requires assets:delete on DELETE /assets/categories/:categoryId (keeps admin/treasurer ceiling)', () => {
    const block = blockBetween("@Delete('categories/:categoryId')", 'async deleteCategory(');
    expect(block).toContain("@RequirePermissions('assets:delete')");
    expect(block).toContain("@RequireRoles('church_admin', 'treasurer')");
  });

  it('requires assets:update on POST /assets/:assetId/archive', () => {
    const block = blockBetween("@Post(':assetId/archive')", 'async archiveAsset(');
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });

  it('requires assets:update on POST /assets/:assetId/restore', () => {
    const block = blockBetween("@Post(':assetId/restore')", 'async restoreAsset(');
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });

  it('requires assets:update on POST /assets/categories/:categoryId/archive', () => {
    const block = blockBetween("@Post('categories/:categoryId/archive')", 'async archiveCategory(');
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });

  it('requires assets:update on POST /assets/categories/:categoryId/restore', () => {
    const block = blockBetween("@Post('categories/:categoryId/restore')", 'async restoreCategory(');
    expect(block).toContain("@RequirePermissions('assets:update')");
    expect(block).toContain('@RequireRoles(...WRITE_ROLES)');
    expect(block).toContain('@HttpCode(HttpStatus.OK)');
  });
});
