/**
 * @file audit-logs.controller.spec.ts
 * @description Unit tests for AuditLogsController — the endpoint exposing the
 * current user's own recent audit entries (scoped by their Supabase `sub`).
 *
 * Asserted against the source text, matching the repo's controller-spec
 * convention, to avoid pulling the guard's transitive ESM-only dependencies
 * (jose) into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROLLER_PATH = path.join(__dirname, '../../../src/common/audit-logs.controller.ts');

describe('AuditLogsController', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  it('exposes GET /audit guarded by JwtAuthGuard', () => {
    expect(source).toContain("@Controller('audit')");
    expect(source).toContain('@UseGuards(JwtAuthGuard)');
    expect(source).toMatch(/@Get\(\)/);
  });

  it('resolves the acting user from req.user.sub (Supabase id) and scopes to their church', () => {
    expect(source).toContain('req.user?.sub');
    expect(source).toContain('req.profile?.church_id');
    expect(source).toContain('const userId = req.user?.sub');
  });

  it('forwards the limit (clamped 1–50, default 10) to AuditLoggingService.query', () => {
    expect(source).toContain('const MAX_LIMIT = 50;');
    expect(source).toContain('const DEFAULT_LIMIT = 10;');
    expect(source).toContain('Math.min(Math.max(parsed, 1), MAX_LIMIT)');
    expect(source).toContain('this.auditLoggingService.query(churchId, {');
    expect(source).toContain('userId,');
    expect(source).toContain('limit: take');
  });

  it('maps raw audit rows to the whitelisted AuditLogItemDto (incl. entityLabel)', () => {
    expect(source).toContain('action: row.action');
    expect(source).toContain('entity: row.entity');
    expect(source).toContain('entityLabel: resolveEntityLabel(row.entity, row.new_values)');
    expect(source).not.toContain('old_values:');
    expect(source).not.toContain('user_agent');
  });
});
