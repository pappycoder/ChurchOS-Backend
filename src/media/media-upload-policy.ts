import { ForbiddenException } from '@nestjs/common';

/** Folder selection never widens an upload grant to a different purpose. */
export const MEDIA_UPLOAD_PERMISSIONS: Record<string, readonly string[]> = {
  churches: ['church_settings:update'],
  branches: ['branches:update'],
  assets: ['media:upload:create', 'assets:list:create', 'assets:list:update'],
  sermons: ['media:upload:create', 'sermons:new:create', 'sermons:update'],
  'form-attachments': ['media:upload:create', 'forms:list:read'],
};

export function assertMediaUploadPermission(folder: string, permissions: readonly string[]) {
  const required = Object.prototype.hasOwnProperty.call(MEDIA_UPLOAD_PERMISSIONS, folder)
    ? MEDIA_UPLOAD_PERMISSIONS[folder]
    : ['media:upload:create'];
  if (!required.some((permission) => permissions.includes(permission))) {
    throw new ForbiddenException('You do not have permission to upload for this purpose');
  }
}
