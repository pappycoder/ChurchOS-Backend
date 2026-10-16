/**
 * @file Regression guards for MediaController permission decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. The media library (browse/folders/single) requires
 * media:library:read, folders -> media:folders:read; permission changes and
 * deletion require media:library:update / media:library:delete on top of the
 * existing JWT requirement. Raw upload endpoints enforce purpose-specific
 * permissions inside the handler so church branding and branch management
 * do not require unrelated media library access. Self-service profile photos
 * use the separate profile-photo endpoint.
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

  it('requires media:library:read on GET /media/library', () => {
    expect(blockBetween("@Get('library')", 'async listLibrary(')).toContain(
      "@RequirePermissions('media:library:read')",
    );
  });

  it('requires media:folders:read on GET /media/library/folders', () => {
    expect(blockBetween("@Get('library/folders')", 'async getFolders(')).toContain(
      "@RequirePermissions('media:folders:read')",
    );
  });

  it('requires media:library:read on GET /media/library/:assetId', () => {
    expect(blockBetween("@Get('library/:assetId')", 'async getAsset(')).toContain(
      "@RequirePermissions('media:library:read')",
    );
  });

  it('requires media:library:update on PATCH /media/library/:assetId/permissions', () => {
    const block = blockBetween(
      "@Patch('library/:assetId/permissions')",
      'async updatePermissions(',
    );
    expect(block).toContain("@RequirePermissions('media:library:update')");
    expect(block).not.toContain('@RequireRoles(');
  });

  it('requires media:library:delete on DELETE /media/library/:assetId', () => {
    const block = blockBetween("@Delete('library/:assetId')", 'async deleteAsset(');
    expect(block).toContain("@RequirePermissions('media:library:delete')");
    expect(block).not.toContain('@RequireRoles(');
  });

  it('requires media:library:delete on the legacy DELETE /media/:path(*) storage delete', () => {
    const block = blockBetween("@Delete('*path')", 'async deleteFile(');
    expect(block).toContain("@RequirePermissions('media:library:delete')");
    expect(block).not.toContain('@RequireRoles(');
  });

  it('checks purpose-specific permissions in both upload handlers', () => {
    const uploadImageBlock = blockBetween("@Post('upload/image')", 'async uploadImage(');
    const uploadFileBlock = blockBetween("@Post('upload')", 'async uploadFile(');
    expect(uploadImageBlock).not.toContain("@RequirePermissions('media:create')");
    expect(uploadFileBlock).not.toContain("@RequirePermissions('media:create')");
    expect(
      source.match(/assertMediaUploadPermission\(folder, req.profile\?\.permissions \?\? \[\]\)/g),
    ).toHaveLength(2);
  });
});
