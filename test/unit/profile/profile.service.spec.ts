/**
 * @file profile.service.spec.ts
 * @description Unit tests for ProfileService.
 *
 * Tests profile CRUD, photo upload, role management, and listing.
 * All external dependencies (Prisma, MediaService, AuditLogging) are mocked.
 *
 * @module test/unit/profile/profile.service.spec
 * @since 1.0.0
 */

import { ProfileService } from '../../../src/profile/profile.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { MediaService, MulterFile } from '../../../src/media/media.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: Record<string, unknown> & { $transaction: jest.Mock };
  let audit: { log: jest.Mock };
  let mediaService: { uploadImage: jest.Mock; deleteByUrl: jest.Mock };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockChurchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const mockProfileId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const mockAdminUserId = '22222222-2222-2222-2222-222222222222';

  function createPrismaMock() {
    const models: Record<string, Record<string, jest.Mock>> = {};
    const $transactionMock = jest.fn();

    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === '$transaction') {
          return $transactionMock;
        }
        if (!models[prop]) {
          models[prop] = {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
          };
        }
        return models[prop];
      },
    };

    return new Proxy(
      { $transaction: $transactionMock } as Record<string, unknown>,
      handler,
    ) as Record<string, unknown> & { $transaction: jest.Mock };
  }

  function model(prismaMock: Record<string, unknown>, name: string): Record<string, jest.Mock> {
    return prismaMock[name] as Record<string, jest.Mock>;
  }

  beforeEach(() => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    mediaService = {
      uploadImage: jest.fn(),
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
    };

    service = new ProfileService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditLoggingService,
      mediaService as unknown as MediaService,
    );
  });

  const mockProfileWithRelations = {
    id: mockProfileId,
    user_id: mockUserId,
    church_id: mockChurchId,
    branch_id: 'branch-1',
    role: 'church_admin',
    first_name: 'Adebayo',
    last_name: 'Ogundimu',
    phone: '+234 803 456 7890',
    avatar_url: null,
    mfa_enabled: false,
    created_at: new Date('2026-07-15T10:00:00.000Z'),
    updated_at: new Date('2026-07-19T14:30:00.000Z'),
    church: {
      id: mockChurchId,
      name: 'Grace Community Church',
      denomination: 'Pentecostal',
      logo_url: null,
    },
    branch: {
      id: 'branch-1',
      name: 'Headquarters',
      is_headquarters: true,
    },
  };

  // ─── GET MY PROFILE ────────────────────────────────────────────────

  describe('getMyProfile', () => {
    it('should return profile with church and branch details', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(mockProfileWithRelations);

      const result = await service.getMyProfile(mockUserId);

      expect(result.profileId).toBe(mockProfileId);
      expect(result.userId).toBe(mockUserId);
      expect(result.churchId).toBe(mockChurchId);
      expect(result.role).toBe('church_admin');
      expect(result.firstName).toBe('Adebayo');
      expect(result.church?.name).toBe('Grace Community Church');
      expect(result.branch?.name).toBe('Headquarters');
      expect(result.createdAt).toBe('2026-07-15T10:00:00.000Z');
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile('nonexistent-user')).rejects.toThrow(NotFoundException);
    });

    it('should handle profile without branch', async () => {
      const profileWithoutBranch = {
        ...mockProfileWithRelations,
        branch_id: null,
        branch: null,
        phone: null,
      };

      model(prisma, 'profile').findUnique.mockResolvedValue(profileWithoutBranch);

      const result = await service.getMyProfile(mockUserId);

      expect(result.branchId).toBeUndefined();
      expect(result.branch).toBeUndefined();
      expect(result.phone).toBeUndefined();
    });

    it('should handle profile with avatar', async () => {
      const profileWithAvatar = {
        ...mockProfileWithRelations,
        avatar_url: 'https://example.com/avatar.webp',
      };

      model(prisma, 'profile').findUnique.mockResolvedValue(profileWithAvatar);

      const result = await service.getMyProfile(mockUserId);

      expect(result.avatarUrl).toBe('https://example.com/avatar.webp');
    });
  });

  // ─── UPDATE MY PROFILE ─────────────────────────────────────────────

  describe('updateMyProfile', () => {
    it('should update profile fields successfully', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({
          id: mockProfileId,
          user_id: mockUserId,
          church_id: mockChurchId,
        })
        .mockResolvedValueOnce(mockProfileWithRelations);

      model(prisma, 'profile').update.mockResolvedValue({});

      const result = await service.updateMyProfile(mockUserId, {
        lastName: 'Updated',
        phone: '+2348000000000',
      });

      expect(result.lastName).toBe('Ogundimu');
      expect(model(prisma, 'profile').update).toHaveBeenCalledWith({
        where: { user_id: mockUserId },
        data: { last_name: 'Updated', phone: '+2348000000000' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          entity: 'profile',
          action: 'UPDATE',
        }),
      );
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      await expect(service.updateMyProfile(mockUserId, { firstName: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return existing profile if no fields provided', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(mockProfileWithRelations);

      const result = await service.updateMyProfile(mockUserId, {});

      expect(result.firstName).toBe('Adebayo');
      expect(model(prisma, 'profile').update).not.toHaveBeenCalled();
    });
  });

  // ─── UPLOAD PROFILE PHOTO ──────────────────────────────────────────

  describe('uploadProfilePhoto', () => {
    it('should upload photo and update avatar_url', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({
          id: mockProfileId,
          user_id: mockUserId,
          church_id: mockChurchId,
          avatar_url: null,
        })
        .mockResolvedValueOnce({
          ...mockProfileWithRelations,
          avatar_url: 'https://example.com/avatar.webp',
        });

      model(prisma, 'profile').update.mockResolvedValue({});

      mediaService.uploadImage.mockResolvedValue({
        url: 'https://example.com/avatar.webp',
        path: 'profiles/church/avatar.webp',
        size: 45000,
        contentType: 'image/webp',
      });

      const mockFile: MulterFile = {
        fieldname: 'file',
        originalname: 'avatar.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 100000,
        buffer: Buffer.from('fake-image'),
      };

      const result = await service.uploadProfilePhoto(mockUserId, mockFile, mockChurchId);

      expect(result.avatarUrl).toBe('https://example.com/avatar.webp');
      expect(mediaService.uploadImage).toHaveBeenCalledWith(mockFile, 'profiles', mockChurchId);
      expect(model(prisma, 'profile').update).toHaveBeenCalledWith({
        where: { user_id: mockUserId },
        data: { avatar_url: 'https://example.com/avatar.webp' },
      });
    });

    it('should delete old avatar before uploading new one', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({
          id: mockProfileId,
          user_id: mockUserId,
          church_id: mockChurchId,
          avatar_url: 'https://example.com/old-avatar.webp',
        })
        .mockResolvedValueOnce({
          ...mockProfileWithRelations,
          avatar_url: 'https://example.com/new-avatar.webp',
        });

      model(prisma, 'profile').update.mockResolvedValue({});

      mediaService.uploadImage.mockResolvedValue({
        url: 'https://example.com/new-avatar.webp',
        path: 'profiles/church/new-avatar.webp',
        size: 45000,
        contentType: 'image/webp',
      });

      const mockFile: MulterFile = {
        fieldname: 'file',
        originalname: 'avatar.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 100000,
        buffer: Buffer.from('fake-image'),
      };

      await service.uploadProfilePhoto(mockUserId, mockFile, mockChurchId);

      expect(mediaService.deleteByUrl).toHaveBeenCalledWith('https://example.com/old-avatar.webp');
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      const mockFile: MulterFile = {
        fieldname: 'file',
        originalname: 'avatar.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 100000,
        buffer: Buffer.from('fake-image'),
      };

      await expect(service.uploadProfilePhoto(mockUserId, mockFile, mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── LIST PROFILES ─────────────────────────────────────────────────

  describe('listProfiles', () => {
    it('should return paginated profiles', async () => {
      model(prisma, 'profile').findMany.mockResolvedValue([mockProfileWithRelations]);
      model(prisma, 'profile').count.mockResolvedValue(1);

      const result = await service.listProfiles(mockChurchId, {});

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].profileId).toBe(mockProfileId);
    });

    it('should apply search filter', async () => {
      model(prisma, 'profile').findMany.mockResolvedValue([]);
      model(prisma, 'profile').count.mockResolvedValue(0);

      await service.listProfiles(mockChurchId, { search: 'Adebayo' });

      expect(model(prisma, 'profile').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                first_name: expect.objectContaining({ contains: 'Adebayo' }),
              }),
            ]),
          }),
        }),
      );
    });

    it('should apply role filter', async () => {
      model(prisma, 'profile').findMany.mockResolvedValue([]);
      model(prisma, 'profile').count.mockResolvedValue(0);

      await service.listProfiles(mockChurchId, { role: 'church_admin' });

      expect(model(prisma, 'profile').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'church_admin' }),
        }),
      );
    });

    it('should apply branch filter', async () => {
      model(prisma, 'profile').findMany.mockResolvedValue([]);
      model(prisma, 'profile').count.mockResolvedValue(0);

      await service.listProfiles(mockChurchId, { branchId: 'branch-1' });

      expect(model(prisma, 'profile').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branch_id: 'branch-1' }),
        }),
      );
    });

    it('should use default pagination', async () => {
      model(prisma, 'profile').findMany.mockResolvedValue([]);
      model(prisma, 'profile').count.mockResolvedValue(0);

      await service.listProfiles(mockChurchId, {});

      expect(model(prisma, 'profile').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  // ─── GET PROFILE BY ID ─────────────────────────────────────────────

  describe('getProfileById', () => {
    it('should return profile by ID', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(mockProfileWithRelations);

      const result = await service.getProfileById(mockProfileId, mockChurchId);

      expect(result.profileId).toBe(mockProfileId);
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      await expect(service.getProfileById('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if profile belongs to another church', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        ...mockProfileWithRelations,
        church_id: 'other-church-id',
      });

      await expect(service.getProfileById(mockProfileId, mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── UPDATE PROFILE ROLE ───────────────────────────────────────────

  describe('updateProfileRole', () => {
    it('should update role successfully', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({
          id: mockProfileId,
          user_id: mockUserId,
          church_id: mockChurchId,
          role: 'member',
        })
        .mockResolvedValueOnce({
          ...mockProfileWithRelations,
          role: 'branch_pastor',
        });

      model(prisma, 'profile').update.mockResolvedValue({});

      const result = await service.updateProfileRole(
        mockProfileId,
        { role: 'branch_pastor' },
        mockChurchId,
        mockAdminUserId,
      );

      expect(result.role).toBe('branch_pastor');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAdminUserId,
          entity: 'profile',
          action: 'UPDATE',
        }),
      );
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfileRole(mockProfileId, { role: 'member' }, mockChurchId, mockAdminUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when modifying super_admin', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        user_id: mockUserId,
        church_id: mockChurchId,
        role: 'super_admin',
      });

      await expect(
        service.updateProfileRole(mockProfileId, { role: 'member' }, mockChurchId, mockAdminUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when trying to self-demotion', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        user_id: mockAdminUserId,
        church_id: mockChurchId,
        role: 'church_admin',
      });

      await expect(
        service.updateProfileRole(mockProfileId, { role: 'member' }, mockChurchId, mockAdminUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── SOFT DELETE PROFILE ───────────────────────────────────────────

  describe('softDeleteProfile', () => {
    it('should deactivate profile successfully', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        user_id: mockUserId,
        church_id: mockChurchId,
        role: 'member',
      });

      await service.softDeleteProfile(mockProfileId, mockChurchId, mockAdminUserId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAdminUserId,
          entity: 'profile',
          action: 'DELETE',
        }),
      );
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      await expect(
        service.softDeleteProfile(mockProfileId, mockChurchId, mockAdminUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when trying to self-deactivate', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        user_id: mockAdminUserId,
        church_id: mockChurchId,
        role: 'church_admin',
      });

      await expect(
        service.softDeleteProfile(mockProfileId, mockChurchId, mockAdminUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
