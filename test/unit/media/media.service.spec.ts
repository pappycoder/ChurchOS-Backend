import { BranchScopeService } from '../../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from '../../../src/media/media.service';
import { SupabaseService } from '../../../src/supabase/supabase.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

describe('MediaService', () => {
  let service: MediaService;
  let storageFrom: jest.Mock;
  let prisma: ReturnType<typeof createPrismaMock>;

  const mockChurchId = '11111111-1111-1111-1111-111111111111';
  const mockAssetId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const mockAsset = {
    id: mockAssetId,
    church_id: mockChurchId,
    filename: 'photo.webp',
    url: 'https://supabase.co/storage/v1/object/public/media/profiles/11111111-1111-1111-1111-111111111111/photo.webp',
    mime_type: 'image/webp',
    size_bytes: 45000,
    folder: 'profiles',
    permissions: 'members',
    created_at: new Date('2026-07-20T10:00:00.000Z'),
  };

  beforeEach(async () => {
    storageFrom = jest.fn().mockReturnValue({
      upload: jest.fn().mockResolvedValue({ data: { path: 'test/path.webp' }, error: null }),
      getPublicUrl: jest
        .fn()
        .mockReturnValue({ data: { publicUrl: 'https://supabase.co/media/test/path.webp' } }),
      remove: jest.fn().mockResolvedValue({ error: null }),
    });

    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestContextService,
        BranchScopeService,
        MediaService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              storage: {
                from: storageFrom,
                getBucket: jest.fn().mockResolvedValue({ data: { public: false }, error: null }),
              },
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('media'),
            getOrThrow: jest.fn().mockReturnValue('https://supabase.co'),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLoggingService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  it('blocks a private library download after a downgrade even for its uploader', async () => {
    prisma.platformSubscription.findUnique.mockResolvedValue({
      plan: 'essentials',
      paid_until: new Date(Date.now() + 86400000),
    });
    prisma.mediaAsset.findFirst.mockResolvedValue({
      ...mockAsset,
      folder: 'uploads',
      uploaded_by_user_id: 'owner',
    });
    await expect(
      service.getFile(
        mockAssetId,
        mockChurchId,
        {
          church_id: mockChurchId,
          is_admin_hq: true,
          permissions: ['media:library:read'],
        } as never,
        undefined,
        'owner',
      ),
    ).rejects.toThrow('not available');
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('streams a sermon recording with range support for a sermon reader without library-edit access', async () => {
    prisma.platformSubscription.findUnique.mockResolvedValue({
      plan: 'community',
      paid_until: new Date(Date.now() + 86400000),
    });
    prisma.mediaAsset.findFirst.mockResolvedValue({
      ...mockAsset,
      folder: 'sermons',
      mime_type: 'audio/mpeg',
      filename: 'Sunday Message.mp3',
      storage_path: 'sermons/church/recording.mp3',
      storage_bucket: 'private',
    });
    storageFrom.mockReturnValue({
      createSignedUrl: jest.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.example/private-signed-file' },
        error: null,
      }),
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-2/100', 'Content-Length': '3' },
      }),
    );
    const result = await service.getFile(
      mockAssetId,
      mockChurchId,
      {
        church_id: mockChurchId,
        role: 'media_team',
        is_admin_hq: true,
        permissions: ['sermons:list:read'],
      },
      'bytes=0-2',
      'reader',
    );
    expect(result.status).toBe(206);
    expect(result.contentRange).toBe('bytes 0-2/100');
    expect(result.file.getHeaders()).toEqual(expect.objectContaining({ type: 'audio/mpeg' }));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://storage.example/private-signed-file',
      expect.objectContaining({ headers: { Range: 'bytes=0-2' } }),
    );
  });

  describe('deleteFile', () => {
    it('should delete a file by path', async () => {
      prisma.mediaAsset.findFirst.mockResolvedValue({
        ...mockAsset,
        storage_path: 'churches/church-1/logo.webp',
      });
      await service.deleteFile('churches/church-1/logo.webp', 'church-1');

      expect(storageFrom).toHaveBeenCalledWith('media');
    });
  });

  describe('deleteByUrl', () => {
    it('should extract path from URL and delete', async () => {
      prisma.mediaAsset.findFirst.mockResolvedValue({ ...mockAsset, folder: 'churches' });
      await service.deleteByUrl(
        'https://supabase.co/storage/v1/object/public/media/churches/church-1/logo.webp',
      );

      expect(storageFrom).toHaveBeenCalledWith('media');
    });

    it('should do nothing if URL does not match storage pattern', async () => {
      await service.deleteByUrl('https://example.com/image.jpg');

      expect(storageFrom).not.toHaveBeenCalled();
    });
  });

  describe('validateFile (via uploadFile)', () => {
    it('keeps the original recording name searchable while using a random storage path', async () => {
      storageFrom.mockReturnValue({
        getBucket: jest.fn().mockResolvedValue({ data: { public: false }, error: null }),
        upload: jest.fn().mockResolvedValue({ error: null }),
      });
      prisma.mediaAsset.create.mockImplementation(async ({ data }) => data);
      const result = await service.uploadFile(
        {
          originalname: 'C:\\recordings\\Sunday Message.mp3',
          mimetype: 'audio/mpeg',
          buffer: Buffer.from('4944330000', 'hex'),
          size: 5,
        } as never,
        'sermons',
        mockChurchId,
        'uploader',
        { is_admin_hq: true } as never,
      );
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          filename: 'Sunday Message.mp3',
          folder: 'sermons',
          mime_type: 'audio/mpeg',
        }),
      });
      expect(result.path).toMatch(new RegExp(`^sermons/${mockChurchId}/[a-f0-9-]+\\.mp3$`));
      expect(result.url).toContain(`/api/backend/media/files/${result.assetId}`);
    });
    it('should throw BadRequestException if no file provided', async () => {
      await expect(service.uploadFile(undefined as never, 'uploads', 'church-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid MIME type', async () => {
      const invalidFile = {
        fieldname: 'file',
        originalname: 'test.exe',
        encoding: '7bit',
        mimetype: 'application/x-executable',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      await expect(service.uploadFile(invalidFile as never, 'uploads', 'church-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for oversized file', async () => {
      const bigFile = {
        fieldname: 'file',
        originalname: 'big.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 51 * 1024 * 1024,
        buffer: Buffer.alloc(1024),
      };

      await expect(service.uploadFile(bigFile as never, 'uploads', 'church-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listLibrary', () => {
    it('should return paginated media assets', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([mockAsset]);
      prisma.mediaAsset.count.mockResolvedValue(1);

      const result = await service.listLibrary({}, mockChurchId);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].assetId).toBe(mockAssetId);
      expect(result.data[0].filename).toBe('photo.webp');
    });

    it('should filter by folder', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.mediaAsset.count.mockResolvedValue(0);

      await service.listLibrary({ folder: 'profiles' }, mockChurchId);

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            folder: expect.objectContaining({ contains: 'profiles' }),
          }),
        }),
      );
    });

    it('should filter by MIME type', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.mediaAsset.count.mockResolvedValue(0);

      await service.listLibrary({ mimeType: 'image/webp' }, mockChurchId);

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            mime_type: expect.objectContaining({ contains: 'image/webp' }),
          }),
        }),
      );
    });

    it('should filter by permissions', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.mediaAsset.count.mockResolvedValue(0);

      await service.listLibrary({ permissions: 'leadership' }, mockChurchId);

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ permissions: 'leadership' }),
        }),
      );
    });

    it('should search by filename', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.mediaAsset.count.mockResolvedValue(0);

      await service.listLibrary({ search: 'photo' }, mockChurchId);

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            filename: expect.objectContaining({ contains: 'photo' }),
          }),
        }),
      );
    });
  });

  describe('getAsset', () => {
    it('should return asset by ID', async () => {
      prisma.mediaAsset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.getAsset(mockAssetId, mockChurchId);

      expect(result.assetId).toBe(mockAssetId);
      expect(result.filename).toBe('photo.webp');
      expect(result.folder).toBe('profiles');
    });

    it('should throw NotFoundException if asset not found', async () => {
      prisma.mediaAsset.findFirst.mockResolvedValue(null);

      await expect(service.getAsset('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getFolders', () => {
    it('should return folder names with counts and newest timestamps', async () => {
      prisma.mediaAsset.groupBy.mockResolvedValue([
        {
          folder: 'profiles',
          _count: { _all: 12 },
          _max: { created_at: new Date('2026-10-01T08:00:00.000Z') },
        },
        { folder: 'sermons', _count: { _all: 4 }, _max: { created_at: null } },
      ]);

      const result = await service.getFolders(mockChurchId);

      expect(result).toEqual([
        { folder: 'profiles', count: 12, newestAt: '2026-10-01T08:00:00.000Z' },
        { folder: 'sermons', count: 4, newestAt: null },
      ]);
      expect(prisma.mediaAsset.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ _count: { _all: true }, _max: { created_at: true } }),
      );
    });
  });

  describe('deleteAsset', () => {
    it('should delete asset from DB and storage', async () => {
      prisma.mediaAsset.findFirst.mockResolvedValue(mockAsset);
      prisma.mediaAsset.delete.mockResolvedValue(mockAsset);

      await service.deleteAsset(mockAssetId, mockChurchId);

      expect(prisma.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: mockAssetId } });
      expect(storageFrom).toHaveBeenCalledWith('media');
    });

    it('should throw NotFoundException if asset not found', async () => {
      prisma.mediaAsset.findFirst.mockResolvedValue(null);

      await expect(service.deleteAsset('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updatePermissions', () => {
    it('should update permissions on an asset', async () => {
      prisma.mediaAsset.findFirst.mockResolvedValue(mockAsset);
      prisma.mediaAsset.update.mockResolvedValue({ ...mockAsset, permissions: 'public' });

      const result = await service.updatePermissions(mockAssetId, 'public', mockChurchId);

      expect(result.permissions).toBe('public');
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: mockAssetId },
        data: { permissions: 'public' },
      });
    });

    it('should throw NotFoundException if asset not found', async () => {
      prisma.mediaAsset.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePermissions('nonexistent', 'public', mockChurchId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
