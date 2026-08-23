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
import { SupabaseService } from '../../../src/supabase/supabase.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../src/redis/redis.service';
import { PermissionsService } from '../../../src/auth/services/permissions.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
  generateURI: jest
    .fn()
    .mockReturnValue('otpauth://totp/test:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=test'),
  verify: jest.fn().mockReturnValue(true),
}));

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: Record<string, unknown> & { $transaction: jest.Mock };
  let audit: { log: jest.Mock };
  let mediaService: { uploadImage: jest.Mock; deleteByUrl: jest.Mock };
  let config: { get: jest.Mock };
  let supabase: {
    client: {
      auth: {
        admin: {
          inviteUserByEmail: jest.Mock;
          updateUserById: jest.Mock;
          getUserById: jest.Mock;
          generateLink: jest.Mock;
          signOut: jest.Mock;
        };
      };
    };
  };
  let redis: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let permissionsService: {
    getRolePermissions: jest.Mock;
    getAllPermissions: jest.Mock;
    getUserPermissions: jest.Mock;
  };

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
    config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'WEB_URL') return 'https://churchos.app';
        return undefined;
      }),
    };
    supabase = {
      client: {
        auth: {
          admin: {
            inviteUserByEmail: jest.fn(),
            updateUserById: jest.fn(),
            getUserById: jest.fn(),
            generateLink: jest.fn(),
            signOut: jest.fn(),
          },
        },
      },
    };
    redis = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
    };
    permissionsService = {
      getRolePermissions: jest.fn().mockRejectedValue(new Error('Role not found')),
      getAllPermissions: jest.fn().mockResolvedValue([]),
      getUserPermissions: jest.fn().mockResolvedValue([]),
    };

    // Echo requested role names back as valid roles by default
    model(prisma, 'role').findMany.mockImplementation(
      ({ where }: { where?: { name?: { in?: string[] } } }) =>
        Promise.resolve((where?.name?.in ?? []).map((name: string) => ({ name }))),
    );
    supabase.client.auth.admin.getUserById.mockResolvedValue({
      data: { user: { last_sign_in_at: '2026-08-20T09:12:00.000Z' } },
      error: null,
    });

    service = new ProfileService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      audit as unknown as AuditLoggingService,
      mediaService as unknown as MediaService,
      supabase as unknown as SupabaseService,
      redis as unknown as RedisService,
      permissionsService as unknown as PermissionsService,
    );
  });

  const mockProfileWithRelations = {
    id: mockProfileId,
    user_id: mockUserId,
    church_id: mockChurchId,
    branch_id: 'branch-1',
    role: ['church_admin'],
    first_name: 'Adebayo',
    last_name: 'Ogundimu',
    email: 'pastor@demo.com',
    phone: '+234 803 456 7890',
    avatar_url: null,
    mfa_enabled: false,
    created_at: new Date('2026-07-15T10:00:00.000Z'),
    updated_at: new Date('2026-07-19T14:30:00.000Z'),
    assigned_roles: [{ role_name: 'church_admin' }],
    member: null,
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
      expect(result.role).toEqual(['church_admin']);
      expect(result.firstName).toBe('Adebayo');
      expect(result.church?.name).toBe('Grace Community Church');
      expect(result.branch?.name).toBe('Headquarters');
      expect(result.createdAt).toBe('2026-07-15T10:00:00.000Z');
    });

    it('should include the resolved permission union on /me', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(mockProfileWithRelations);
      permissionsService.getUserPermissions.mockResolvedValue(['members:read', 'members:create', 'branches:read']);

      const result = await service.getMyProfile(mockUserId);

      expect(permissionsService.getUserPermissions).toHaveBeenCalledWith(mockChurchId, ['church_admin']);
      expect(result.permissions).toEqual(['members:read', 'members:create', 'branches:read']);
    });

    it('should soft-fail to empty permissions when resolution errors', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(mockProfileWithRelations);
      permissionsService.getUserPermissions.mockRejectedValue(new Error('redis down'));

      const result = await service.getMyProfile(mockUserId);

      expect(result.permissions).toEqual([]);
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile('nonexistent-user')).rejects.toThrow(NotFoundException);
    });

    it('should hydrate a missing email from Supabase Auth and persist it', async () => {
      supabase.client.auth.admin.getUserById.mockResolvedValueOnce({
        data: { user: { email: 'hydrated@demo.com' } },
        error: null,
      });
      model(prisma, 'profile').findUnique.mockResolvedValue({
        ...mockProfileWithRelations,
        email: null,
      });

      const result = await service.getMyProfile(mockUserId);

      expect(result.email).toBe('hydrated@demo.com');
      expect(supabase.client.auth.admin.getUserById).toHaveBeenCalledWith(mockUserId);
      expect(model(prisma, 'profile').update).toHaveBeenCalledWith({
        where: { id: mockProfileId },
        data: { email: 'hydrated@demo.com' },
      });
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

    it('should never touch Supabase Auth — email is managed via church settings', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({
          id: mockProfileId,
          user_id: mockUserId,
          church_id: mockChurchId,
          email: 'old@demo.com',
        })
        .mockResolvedValueOnce(mockProfileWithRelations);

      await service.updateMyProfile(mockUserId, { firstName: 'NewName' });

      expect(supabase.client.auth.admin.updateUserById).not.toHaveBeenCalled();
      expect(model(prisma, 'profile').update).toHaveBeenCalledWith({
        where: { user_id: mockUserId },
        data: { first_name: 'NewName' },
      });
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

  describe('MFA secret storage', () => {
    it('should store generated MFA secrets in Redis for later verification', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        ...mockProfileWithRelations,
        church: { name: 'Grace Community Church' },
      });
      model(prisma, 'profile').update.mockResolvedValue({});

      await service.generateMfaSecret(mockUserId);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('mfa:'),
        expect.any(String),
        600,
      );
    });

    it('should verify MFA using the Redis-stored secret', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({
          ...mockProfileWithRelations,
          mfa_enabled: false,
        })
        .mockResolvedValueOnce({
          ...mockProfileWithRelations,
          mfa_enabled: true,
        });
      redis.get.mockResolvedValue('JBSWY3DPEHPK3PXP');

      const result = await service.enableMfa(mockUserId, '123456');

      expect(result.mfaEnabled).toBe(true);
      expect(redis.get).toHaveBeenCalledWith(expect.stringContaining('mfa:'));
    });
  });

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
          where: expect.objectContaining({ role: { has: 'church_admin' } }),
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
          role: ['member'],
          assigned_roles: [],
        })
        .mockResolvedValueOnce({
          ...mockProfileWithRelations,
          role: ['branch_pastor'],
        });

      model(prisma, 'profile').update.mockResolvedValue({});

      const result = await service.updateProfileRole(
        mockProfileId,
        { role: 'branch_pastor' },
        mockChurchId,
        mockAdminUserId,
        'church_admin',
      );

      expect(result.role).toEqual(['branch_pastor']);
      expect(model(prisma, 'profile').update).toHaveBeenCalledWith({
        where: { id: mockProfileId },
        data: { role: ['branch_pastor'] },
      });
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
        service.updateProfileRole(
          mockProfileId,
          { role: 'member' },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when modifying super_admin', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        user_id: mockUserId,
        church_id: mockChurchId,
        role: 'super_admin',
        assigned_roles: [],
      });

      await expect(
        service.updateProfileRole(
          mockProfileId,
          { role: 'member' },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when trying to self-demotion', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        user_id: mockAdminUserId,
        church_id: mockChurchId,
        role: 'church_admin',
        assigned_roles: [],
      });

      await expect(
        service.updateProfileRole(
          mockProfileId,
          { role: 'member' },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when a church_admin tries to assign super_admin', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        user_id: mockUserId,
        church_id: mockChurchId,
        role: 'member',
        assigned_roles: [],
      });

      await expect(
        service.updateProfileRole(
          mockProfileId,
          { role: 'super_admin' },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when assigning a role above own rank', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        user_id: mockUserId,
        church_id: mockChurchId,
        role: 'member',
        assigned_roles: [],
      });

      await expect(
        service.updateProfileRole(
          mockProfileId,
          { role: 'senior_pastor' },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow super_admin to assign the super_admin role', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({
          id: mockProfileId,
          user_id: mockUserId,
          church_id: mockChurchId,
          role: ['member'],
          assigned_roles: [],
        })
        .mockResolvedValueOnce({
          ...mockProfileWithRelations,
          role: ['super_admin'],
        });

      model(prisma, 'profile').update.mockResolvedValue({});

      const result = await service.updateProfileRole(
        mockProfileId,
        { role: 'super_admin' },
        mockChurchId,
        mockAdminUserId,
        'super_admin',
      );

      expect(result.role).toEqual(['super_admin']);
    });
  });

  // ─── UPDATE PROFILE ROLES (MULTI-ROLE) ─────────────────────────────

  describe('updateProfileRoles', () => {
    const baseProfile = {
      id: mockProfileId,
      user_id: mockUserId,
      church_id: mockChurchId,
      branch_id: null,
      role: ['member'],
      status: 'active',
      first_name: 'Adebayo',
      last_name: 'Ogundimu',
      email: null,
      phone: null,
      avatar_url: null,
      mfa_enabled: false,
      created_at: new Date('2026-07-15T10:00:00.000Z'),
      updated_at: new Date('2026-07-19T14:30:00.000Z'),
    };

    it('should assign multiple roles ordered by rank descending', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({ ...baseProfile })
        .mockResolvedValueOnce({ ...baseProfile, role: ['church_admin', 'treasurer'] });

      const result = await service.updateProfileRoles(
        mockProfileId,
        { roles: ['treasurer', 'church_admin'] },
        mockChurchId,
        mockAdminUserId,
        'super_admin',
      );

      expect(model(prisma, 'profile').update).toHaveBeenCalledWith({
        where: { id: mockProfileId },
        data: { role: ['church_admin', 'treasurer'] },
      });
      expect(result.role).toEqual(['church_admin', 'treasurer']);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: { roles: ['member'] },
          newValues: { roles: ['church_admin', 'treasurer'] },
        }),
      );
    });

    it('should reject unknown role names with BadRequestException', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({ ...baseProfile });
      model(prisma, 'role').findMany.mockResolvedValueOnce([]);

      await expect(
        service.updateProfileRoles(
          mockProfileId,
          { roles: ['space_wizard'] },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject roles above the caller rank', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({ ...baseProfile });

      await expect(
        service.updateProfileRoles(
          mockProfileId,
          { roles: ['senior_pastor'] },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block self role changes but allow no-op self updates', async () => {
      const selfProfile = { ...baseProfile, user_id: mockAdminUserId, role: ['secretary'] };
      model(prisma, 'profile').findUnique.mockResolvedValue({ ...selfProfile });

      await expect(
        service.updateProfileRoles(
          mockProfileId,
          { roles: ['member'] },
          mockChurchId,
          mockAdminUserId,
          'super_admin',
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateProfileRoles(
          mockProfileId,
          { roles: ['secretary'] },
          mockChurchId,
          mockAdminUserId,
          'super_admin',
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── ADMIN UPDATE USER ─────────────────────────────────────────────

  describe('adminUpdateProfile', () => {
    const baseProfile = {
      id: mockProfileId,
      user_id: mockUserId,
      church_id: mockChurchId,
      branch_id: null,
      role: ['secretary'],
      status: 'active',
      first_name: 'Adebayo',
      last_name: 'Ogundimu',
      email: 'adebayo@church.com',
      phone: '+234 803 456 7890',
      avatar_url: null,
      mfa_enabled: false,
      created_at: new Date('2026-07-15T10:00:00.000Z'),
      updated_at: new Date('2026-07-19T14:30:00.000Z'),
    };

    it('should update basic fields and audit-log the change', async () => {
      model(prisma, 'profile')
        .findUnique.mockResolvedValueOnce({ ...baseProfile })
        .mockResolvedValueOnce({ ...baseProfile, first_name: 'Chinedu' });
      model(prisma, 'branch').findFirst.mockResolvedValue({ id: 'branch-9' });
      model(prisma, 'profile').update.mockResolvedValue({});

      await service.adminUpdateProfile(
        mockProfileId,
        { firstName: 'Chinedu', branchId: 'branch-9', phone: '+2348000000000' },
        mockChurchId,
        mockAdminUserId,
        'church_admin',
      );

      expect(model(prisma, 'profile').update).toHaveBeenCalledWith({
        where: { id: mockProfileId },
        data: {
          first_name: 'Chinedu',
          phone: '+2348000000000',
          branch_id: 'branch-9',
        },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'profile', action: 'UPDATE' }),
      );
    });

    it('should sync email changes to Supabase Auth', async () => {
      supabase.client.auth.admin.updateUserById.mockResolvedValue({ error: null });
      model(prisma, 'profile').findUnique.mockResolvedValue({ ...baseProfile });
      model(prisma, 'profile').update.mockResolvedValue({});

      await service.adminUpdateProfile(
        mockProfileId,
        { email: 'new@church.com' },
        mockChurchId,
        mockAdminUserId,
        'church_admin',
      );

      expect(supabase.client.auth.admin.updateUserById).toHaveBeenCalledWith(mockUserId, {
        email: 'new@church.com',
      });
    });

    it('should throw ForbiddenException when a church_admin edits a super_admin', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        ...baseProfile,
        role: ['super_admin'],
      });

      await expect(
        service.adminUpdateProfile(
          mockProfileId,
          { firstName: 'X' },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when the branch is outside the church', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({ ...baseProfile });
      model(prisma, 'branch').findFirst.mockResolvedValue(null);

      await expect(
        service.adminUpdateProfile(
          mockProfileId,
          { branchId: 'branch-other-church' },
          mockChurchId,
          mockAdminUserId,
          'church_admin',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block self-deactivation', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue({
        ...baseProfile,
        user_id: mockAdminUserId,
      });

      await expect(
        service.adminUpdateProfile(
          mockProfileId,
          { status: 'inactive' },
          mockChurchId,
          mockAdminUserId,
          'super_admin',
        ),
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
        status: 'active',
      });

      await service.softDeleteProfile(mockProfileId, mockChurchId, mockAdminUserId);

      expect(model(prisma, 'profile').update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockProfileId },
          data: { status: 'inactive' },
        }),
      );
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
