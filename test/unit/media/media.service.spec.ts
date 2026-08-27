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
    url: 'https://xxx.supabase.co/storage/v1/object/public/media/profiles/11111111-1111-1111-1111-111111111111/photo.webp',
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
        MediaService,
        { provide: SupabaseService, useValue: { client: { storage: { from: storageFrom } } } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('media') } },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLoggingService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  describe('deleteFile', () => {
    it('should delete a file by path', async () => {
      await service.deleteFile('churches/church-1/logo.webp');

      expect(storageFrom).toHaveBeenCalledWith('media');
    });
  });

  describe('deleteByUrl', () => {
    it('should extract path from URL and delete', async () => {
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
    it('should return unique folder names', async () => {
      prisma.mediaAsset.groupBy.mockResolvedValue([{ folder: 'profiles' }, { folder: 'sermons' }]);

      const result = await service.getFolders(mockChurchId);

      expect(result).toEqual(['profiles', 'sermons']);
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
