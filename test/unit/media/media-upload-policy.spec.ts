import { ForbiddenException } from '@nestjs/common';
import { assertMediaUploadPermission } from '../../../src/media/media-upload-policy';

describe('purpose-specific media upload authorization', () => {
  it.each(['uploads', 'documents', 'profiles', 'assets', 'sermons', 'form-attachments'])(
    'denies %s without an effective grant',
    (folder) => {
      expect(() => assertMediaUploadPermission(folder, [])).toThrow(ForbiddenException);
    },
  );
  it('permits asset editors without granting general uploads or church branding', () => {
    expect(() => assertMediaUploadPermission('assets', ['assets:list:update'])).not.toThrow();
    expect(() => assertMediaUploadPermission('documents', ['assets:list:update'])).toThrow(
      ForbiddenException,
    );
    expect(() => assertMediaUploadPermission('churches', ['assets:list:update'])).toThrow(
      ForbiddenException,
    );
  });
  it('keeps read-only asset access from uploading files', () => {
    expect(() => assertMediaUploadPermission('assets', ['assets:list:read'])).toThrow(
      ForbiddenException,
    );
  });
  it('permits attachments for authorized form respondents, without library publishing', () => {
    expect(() =>
      assertMediaUploadPermission('form-attachments', ['forms:list:read']),
    ).not.toThrow();
    expect(() => assertMediaUploadPermission('documents', ['forms:list:read'])).toThrow(
      ForbiddenException,
    );
  });
  it('permits sermon editing uploads without media library grants', () => {
    expect(() => assertMediaUploadPermission('sermons', ['sermons:update'])).not.toThrow();
  });
  it('reserves public church and branch branding even from general uploaders', () => {
    for (const folder of ['churches', 'branches'])
      expect(() => assertMediaUploadPermission(folder, ['media:upload:create'])).toThrow(
        ForbiddenException,
      );
    expect(() => assertMediaUploadPermission('churches', ['church_settings:update'])).not.toThrow();
    expect(() => assertMediaUploadPermission('branches', ['branches:update'])).not.toThrow();
  });
  it.each(['__proto__', 'constructor', 'toString'])(
    'treats inherited object keys as ordinary folder names: %s',
    (folder) => {
      expect(() => assertMediaUploadPermission(folder, [])).toThrow(ForbiddenException);
      expect(() => assertMediaUploadPermission(folder, ['media:upload:create'])).not.toThrow();
    },
  );
});
