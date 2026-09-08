/**
 * @file Regression guards for PastoralController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. All pastoral routes (notes, life events, and the
 * risk/engagement scoring endpoints) must carry granular surface permissions
 * (pastoral:notes:*, pastoral:life-events:*, pastoral:risk-scores:read,
 * pastoral:engagement:read) so the frontend permission gates match the
 * server's enforcement layer.
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

  it('requires pastoral:notes:create on POST /pastoral/notes', () => {
    expect(blockBetween("@Post('notes')", 'async createNote(')).toContain(
      "@RequirePermissions('pastoral:notes:create')",
    );
  });

  it('requires pastoral:notes:read on GET /pastoral/notes and GET /pastoral/notes/:noteId', () => {
    expect(blockBetween("@Get('notes')", 'async listNotes(')).toContain(
      "@RequirePermissions('pastoral:notes:read')",
    );
    expect(blockBetween("@Get('notes/:noteId')", 'async getNoteById(')).toContain(
      "@RequirePermissions('pastoral:notes:read')",
    );
  });

  it('requires pastoral:notes:update on PATCH /pastoral/notes/:noteId', () => {
    expect(blockBetween("@Patch('notes/:noteId')", 'async updateNote(')).toContain(
      "@RequirePermissions('pastoral:notes:update')",
    );
  });

  it('requires pastoral:notes:delete on DELETE /pastoral/notes/:noteId', () => {
    expect(blockBetween("@Delete('notes/:noteId')", 'async deleteNote(')).toContain(
      "@RequirePermissions('pastoral:notes:delete')",
    );
  });

  it('requires pastoral:life-events:create on POST /pastoral/life-events', () => {
    expect(blockBetween("@Post('life-events')", 'async createLifeEvent(')).toContain(
      "@RequirePermissions('pastoral:life-events:create')",
    );
  });

  it('requires pastoral:life-events:read on the life-event reads', () => {
    expect(blockBetween("@Get('life-events')", 'async listLifeEvents(')).toContain(
      "@RequirePermissions('pastoral:life-events:read')",
    );
    expect(blockBetween("@Get('life-events/upcoming')", 'async getUpcomingLifeEvents(')).toContain(
      "@RequirePermissions('pastoral:life-events:read')",
    );
    expect(blockBetween("@Get('life-events/:eventId')", 'async getLifeEventById(')).toContain(
      "@RequirePermissions('pastoral:life-events:read')",
    );
  });

  it('requires pastoral:life-events:delete on DELETE /pastoral/life-events/:eventId', () => {
    expect(blockBetween("@Delete('life-events/:eventId')", 'async deleteLifeEvent(')).toContain(
      "@RequirePermissions('pastoral:life-events:delete')",
    );
  });

  it('requires pastoral:risk-scores:read on GET /pastoral/risk-scores', () => {
    expect(blockBetween("@Get('risk-scores')", 'async listRiskScores(')).toContain(
      "@RequirePermissions('pastoral:risk-scores:read')",
    );
  });

  it('requires pastoral:engagement:read on GET /pastoral/engagement-scores', () => {
    expect(blockBetween("@Get('engagement-scores')", 'async listEngagementScores(')).toContain(
      "@RequirePermissions('pastoral:engagement:read')",
    );
  });

  it('requires pastoral:engagement:read on GET /pastoral/engagement/summary', () => {
    expect(
      blockBetween("@Get('engagement/summary')", 'async getEngagementDistribution('),
    ).toContain("@RequirePermissions('pastoral:engagement:read')");
  });

  it('requires pastoral:risk-scores:read on GET /pastoral/members/:memberId/scoring', () => {
    expect(blockBetween("@Get('members/:memberId/scoring')", 'async getMemberScoring(')).toContain(
      "@RequirePermissions('pastoral:risk-scores:read')",
    );
  });

  it('requires pastoral:notes:update on POST /pastoral/notes/:noteId/archive', () => {
    expect(blockBetween("@Post('notes/:noteId/archive')", 'async archiveNote(')).toContain(
      "@RequirePermissions('pastoral:notes:update')",
    );
    expect(blockBetween("@Post('notes/:noteId/archive')", 'async archiveNote(')).toContain(
      '@HttpCode(HttpStatus.OK)',
    );
  });

  it('requires pastoral:notes:update on POST /pastoral/notes/:noteId/restore', () => {
    expect(blockBetween("@Post('notes/:noteId/restore')", 'async restoreNote(')).toContain(
      "@RequirePermissions('pastoral:notes:update')",
    );
    expect(blockBetween("@Post('notes/:noteId/restore')", 'async restoreNote(')).toContain(
      '@HttpCode(HttpStatus.OK)',
    );
  });

  it('requires pastoral:life-events:update on POST /pastoral/life-events/:lifeEventId/archive', () => {
    expect(
      blockBetween("@Post('life-events/:lifeEventId/archive')", 'async archiveLifeEvent('),
    ).toContain("@RequirePermissions('pastoral:life-events:update')");
    expect(
      blockBetween("@Post('life-events/:lifeEventId/archive')", 'async archiveLifeEvent('),
    ).toContain('@HttpCode(HttpStatus.OK)');
  });

  it('requires pastoral:life-events:update on POST /pastoral/life-events/:lifeEventId/restore', () => {
    expect(
      blockBetween("@Post('life-events/:lifeEventId/restore')", 'async restoreLifeEvent('),
    ).toContain("@RequirePermissions('pastoral:life-events:update')");
    expect(
      blockBetween("@Post('life-events/:lifeEventId/restore')", 'async restoreLifeEvent('),
    ).toContain('@HttpCode(HttpStatus.OK)');
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