/**
 * @file Regression guards for MediaController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. The media library (browse/folders/single) requires
 * media:read; permission changes and deletion require media:update / media:delete
 * on top of the existing church_admin role ceiling. The raw upload endpoints
 * stay auth-only on purpose (profile photos, church logos, and sermon media are
 * uploaded by consumers who do not necessarily hold media:create).
 *
 * Asserted against the source text to avoid pulling the controller's
 * transitive ESM-only dependencies into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROLLER_PATH = path.join(__dirname, '../../../src/media/media.controller.ts');

describe('MediaController permission decorators', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  it('requires media:read on GET /media/library', () => {
    expect(blockBetween("@Get('library')", 'async listLibrary(')).toContain(
      "@RequirePermissions('media:read')",
    );
  });

  it('requires media:read on GET /media/library/folders', () => {
    expect(blockBetween("@Get('library/folders')", 'async getFolders(')).toContain(
      "@RequirePermissions('media:read')",
    );
  });

  it('requires media:read on GET /media/library/:assetId', () => {
    expect(blockBetween("@Get('library/:assetId')", 'async getAsset(')).toContain(
      "@RequirePermissions('media:read')",
    );
  });

  it('requires media:update on PATCH /media/library/:assetId/permissions', () => {
    const block = blockBetween(
      "@Patch('library/:assetId/permissions')",
      'async updatePermissions(',
    );
    expect(block).toContain("@RequirePermissions('media:update')");
    expect(block).toContain("@RequireRoles('church_admin')");
  });

  it('requires media:delete on DELETE /media/library/:assetId', () => {
    const block = blockBetween("@Delete('library/:assetId')", 'async deleteAsset(');
    expect(block).toContain("@RequirePermissions('media:delete')");
    expect(block).toContain("@RequireRoles('church_admin')");
  });

  it('keeps upload endpoints auth-only (no media:create lock on raw uploads)', () => {
    const uploadImageBlock = blockBetween("@Post('upload/image')", 'async uploadImage(');
    const uploadFileBlock = blockBetween("@Post('upload')", 'async uploadFile(');
    expect(uploadImageBlock).not.toContain('@RequirePermissions(');
    expect(uploadFileBlock).not.toContain('@RequirePermissions(');
  });
});
