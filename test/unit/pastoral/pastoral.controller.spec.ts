/**
 * @file Regression guards for PastoralController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. All pastoral routes (notes, life events, and the
 * risk/engagement scoring endpoints) must carry granular permissions so the
 * frontend permission gates match the server's enforcement layer.
 *
 * Asserted against the source text to avoid pulling the controllers'
 * transitive ESM-only dependencies into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const PASTORAL_CONTROLLER_PATH = path.join(
  __dirname,
  '../../../src/pastoral/pastoral.controller.ts',
);
const ADMIN_CONTROLLER_PATH = path.join(__dirname, '../../../src/admin/admin.controller.ts');

describe('PastoralController permission decorators', () => {
  const source = fs.readFileSync(PASTORAL_CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  it('requires pastoral:create on POST /pastoral/notes', () => {
    expect(blockBetween("@Post('notes')", 'async createNote(')).toContain(
      "@RequirePermissions('pastoral:create')",
    );
  });

  it('requires pastoral:read on GET /pastoral/notes and GET /pastoral/notes/:noteId', () => {
    expect(blockBetween("@Get('notes')", 'async listNotes(')).toContain(
      "@RequirePermissions('pastoral:read')",
    );
    expect(blockBetween("@Get('notes/:noteId')", 'async getNoteById(')).toContain(
      "@RequirePermissions('pastoral:read')",
    );
  });

  it('requires pastoral:update on PATCH /pastoral/notes/:noteId', () => {
    expect(blockBetween("@Patch('notes/:noteId')", 'async updateNote(')).toContain(
      "@RequirePermissions('pastoral:update')",
    );
  });

  it('requires pastoral:delete on DELETE /pastoral/notes/:noteId', () => {
    expect(blockBetween("@Delete('notes/:noteId')", 'async deleteNote(')).toContain(
      "@RequirePermissions('pastoral:delete')",
    );
  });

  it('requires pastoral:create on POST /pastoral/life-events', () => {
    expect(blockBetween("@Post('life-events')", 'async createLifeEvent(')).toContain(
      "@RequirePermissions('pastoral:create')",
    );
  });

  it('requires pastoral:read on the life-event reads', () => {
    expect(blockBetween("@Get('life-events')", 'async listLifeEvents(')).toContain(
      "@RequirePermissions('pastoral:read')",
    );
    expect(blockBetween("@Get('life-events/upcoming')", 'async getUpcomingLifeEvents(')).toContain(
      "@RequirePermissions('pastoral:read')",
    );
    expect(blockBetween("@Get('life-events/:eventId')", 'async getLifeEventById(')).toContain(
      "@RequirePermissions('pastoral:read')",
    );
  });

  it('requires pastoral:delete on DELETE /pastoral/life-events/:eventId', () => {
    expect(blockBetween("@Delete('life-events/:eventId')", 'async deleteLifeEvent(')).toContain(
      "@RequirePermissions('pastoral:delete')",
    );
  });

  it('requires pastoral:read on GET /pastoral/risk-scores', () => {
    expect(blockBetween("@Get('risk-scores')", 'async listRiskScores(')).toContain(
      "@RequirePermissions('pastoral:read')",
    );
  });

  it('requires pastoral:read on GET /pastoral/engagement-scores', () => {
    expect(blockBetween("@Get('engagement-scores')", 'async listEngagementScores(')).toContain(
      "@RequirePermissions('pastoral:read')",
    );
  });

  it('requires pastoral:read on GET /pastoral/engagement/summary', () => {
    expect(
      blockBetween("@Get('engagement/summary')", 'async getEngagementDistribution('),
    ).toContain("@RequirePermissions('pastoral:read')");
  });

  it('requires pastoral:read on GET /pastoral/members/:memberId/scoring', () => {
    expect(blockBetween("@Get('members/:memberId/scoring')", 'async getMemberScoring(')).toContain(
      "@RequirePermissions('pastoral:read')",
    );
  });
});

describe('AdminController recalculate-scores permission decorator', () => {
  const source = fs.readFileSync(ADMIN_CONTROLLER_PATH, 'utf8');

  it('requires pastoral:update (permission gate, not a role check) on POST /admin/dashboard/recalculate-scores', () => {
    const startIdx = source.indexOf("@Post('dashboard/recalculate-scores')");
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf('async recalculateScores(', startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    const block = source.slice(startIdx, endIdx);

    expect(block).toContain("@RequirePermissions('pastoral:update')");
    expect(block).not.toContain('@RequireRoles(');
  });
});
