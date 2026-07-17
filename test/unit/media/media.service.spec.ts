import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from '../../../src/media/media.service';
import { SupabaseService } from '../../../src/supabase/supabase.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('MediaService', () => {
  let service: MediaService;
  let storageFrom: jest.Mock;

  beforeEach(async () => {
    storageFrom = jest.fn().mockReturnValue({
      upload: jest.fn().mockResolvedValue({ data: { path: 'test/path.webp' }, error: null }),
      getPublicUrl: jest
        .fn()
        .mockReturnValue({ data: { publicUrl: 'https://supabase.co/media/test/path.webp' } }),
      remove: jest.fn().mockResolvedValue({ error: null }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: SupabaseService, useValue: { client: { storage: { from: storageFrom } } } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('media') } },
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
        size: 10 * 1024 * 1024,
        buffer: Buffer.alloc(10 * 1024 * 1024),
      };

      await expect(service.uploadFile(bigFile as never, 'uploads', 'church-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
