/**
 * @file Regression guards for ReportsController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. All report routes must carry granular
 * `reports:view` so the frontend permission gates match the server's
 * enforcement layer, while the per-report role ceilings are preserved.
 *
 * Asserted against the source text to avoid pulling the controllers'
 * transitive ESM-only dependencies into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPORTS_CONTROLLER_PATH = path.join(__dirname, '../../../src/reports/reports.controller.ts');

describe('ReportsController permission decorators', () => {
  const source = fs.readFileSync(REPORTS_CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  it('requires reports:view on GET /reports/financial (keeps church_admin/senior_pastor/treasurer ceiling)', () => {
    const block = blockBetween("@Get('financial')", 'async getFinancialReport(');
    expect(block).toContain("@RequirePermissions('reports:financial:read')");
    expect(block).not.toContain('@RequireRoles(');
  });

  it('requires reports:view on GET /reports/attendance (keeps church_admin/senior_pastor/branch_pastor ceiling)', () => {
    const block = blockBetween("@Get('attendance')", 'async getAttendanceReport(');
    expect(block).toContain("@RequirePermissions('reports:attendance:read')");
    expect(block).not.toContain('@RequireRoles(');
  });

  it('requires reports:view on GET /reports/members (keeps church_admin/senior_pastor/branch_pastor/secretary ceiling)', () => {
    const block = blockBetween("@Get('members')", 'async getMemberReport(');
    expect(block).toContain("@RequirePermissions('reports:members:read')");
    expect(block).not.toContain('@RequireRoles(');
  });

  it('requires reports:view on POST /reports/export (keeps church_admin/senior_pastor/treasurer ceiling)', () => {
    const block = blockBetween("@Post('export')", 'async exportReport(');
    expect(block).toContain("@RequirePermissions('reports:view')");
    expect(block).not.toContain('@RequireRoles(');
  });
});
