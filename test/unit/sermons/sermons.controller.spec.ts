/**
 * @file Regression guards for SermonsController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. Every sermons route must declare its permission
 * (reads -> sermons:read, create -> sermons:create, update -> sermons:update,
 * delete -> sermons:delete) while the member-scoped bookmark endpoints stay
 * auth-only.
 *
 * Asserted against the source text to avoid pulling the controller's
 * transitive ESM-only dependencies into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROLLER_PATH = path.join(__dirname, '../../../src/sermons/sermons.controller.ts');

describe('SermonsController permission decorators', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  it('requires sermons:create on POST /sermons', () => {
    expect(blockBetween('@Post()', 'async createSermon(')).toContain(
      "@RequirePermissions('sermons:create')",
    );
  });

  it('requires sermons:read on GET /sermons', () => {
    expect(blockBetween('@Get()', 'async listSermons(')).toContain(
      "@RequirePermissions('sermons:read')",
    );
  });

  it('requires sermons:read on GET /sermons/series', () => {
    expect(blockBetween("@Get('series')", 'async listSeries(')).toContain(
      "@RequirePermissions('sermons:read')",
    );
  });

  it('requires sermons:read on GET /sermons/speakers', () => {
    expect(blockBetween("@Get('speakers')", 'async listSpeakers(')).toContain(
      "@RequirePermissions('sermons:read')",
    );
  });

  it('requires sermons:read on GET /sermons/:sermonId', () => {
    expect(blockBetween("@Get(':sermonId')", 'async getSermon(')).toContain(
      "@RequirePermissions('sermons:read')",
    );
  });

  it('requires sermons:update on PATCH /sermons/:sermonId', () => {
    expect(blockBetween("@Patch(':sermonId')", 'async updateSermon(')).toContain(
      "@RequirePermissions('sermons:update')",
    );
  });

  it('requires sermons:delete on DELETE /sermons/:sermonId', () => {
    expect(blockBetween("@Delete(':sermonId')", 'async deleteSermon(')).toContain(
      "@RequirePermissions('sermons:delete')",
    );
  });

  it('keeps bookmark endpoints auth-only (no permission leak to admin reads)', () => {
    const bookmarksStart = source.indexOf('// ─── BOOKMARKS');
    expect(bookmarksStart).toBeGreaterThan(-1);
    const bookmarksBlock = source.slice(bookmarksStart);
    expect(bookmarksBlock).not.toContain('@RequirePermissions(');
  });
});
