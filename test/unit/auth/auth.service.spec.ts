/**
 * @file auth.service.spec.ts
 * @description Unit tests for AuthService.
 *
 * Tests registration (Supabase + Prisma transaction) and profile retrieval.
 * All external dependencies (Supabase, Prisma, AuditLogging) are mocked.
 *
 * @module test/unit/auth/auth.service.spec
 * @since 1.0.0
 */

import { AuthService } from '../../../src/auth/auth.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SupabaseService } from '../../../src/supabase/supabase.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RegisterDto } from '../../../src/auth/dto/register.dto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: Record<string, unknown> & { $transaction: jest.Mock };
  let signUpMock: jest.Mock;
  let audit: { log: jest.Mock };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockChurchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const mockProfileId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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
    signUpMock = jest.fn();

    service = new AuthService(
      prisma as unknown as PrismaService,
      { client: { auth: { signUp: signUpMock } } } as unknown as SupabaseService,
      audit as unknown as AuditLoggingService,
    );
  });

  describe('register', () => {
    const validDto: RegisterDto = {
      email: 'pastor@gracecommunity.com',
      password: 'SecureP@ss123',
      firstName: 'Adebayo',
      lastName: 'Ogundimu',
      phone: '+234 803 456 7890',
      churchName: 'Grace Community Church',
      denomination: 'Pentecostal',
    };

    it('should create user, church, and profile successfully', async () => {
      signUpMock.mockResolvedValue({
        data: { user: { id: mockUserId, email: validDto.email } },
        error: null,
      });

      // Mock Prisma $transaction
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, Record<string, jest.Mock>>) => Promise<unknown>) => {
          return cb({
            church: {
              create: jest.fn().mockResolvedValue({
                id: mockChurchId,
                name: validDto.churchName,
                denomination: validDto.denomination,
              }),
            },
            profile: {
              create: jest.fn().mockResolvedValue({
                id: mockProfileId,
                user_id: mockUserId,
                church_id: mockChurchId,
                role: 'church_admin',
                first_name: validDto.firstName,
                last_name: validDto.lastName,
                phone: validDto.phone,
              }),
            },
          });
        },
      );

      const result = await service.register(validDto);

      expect(result).toEqual({
        userId: mockUserId,
        email: validDto.email,
        profileId: mockProfileId,
        churchId: mockChurchId,
        churchName: validDto.churchName,
        role: 'church_admin',
      });

      expect(signUpMock).toHaveBeenCalledWith({
        email: validDto.email,
        password: validDto.password,
        options: {
          data: {
            first_name: validDto.firstName,
            last_name: validDto.lastName,
            church_name: validDto.churchName,
          },
        },
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          churchId: mockChurchId,
          entity: 'auth',
          action: 'CREATE',
        }),
      );
    });

    it('should throw ConflictException if email is already registered', async () => {
      signUpMock.mockResolvedValue({
        data: { user: null },
        error: { message: 'already registered' },
      });

      await expect(service.register(validDto)).rejects.toThrow(ConflictException);
    });

    it('should throw InternalServerErrorException if Supabase fails', async () => {
      signUpMock.mockResolvedValue({
        data: { user: null },
        error: { message: 'Internal server error' },
      });

      await expect(service.register(validDto)).rejects.toThrow('Failed to create user account');
    });

    it('should throw InternalServerErrorException if Supabase returns no user', async () => {
      signUpMock.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await expect(service.register(validDto)).rejects.toThrow('Failed to create user account');
    });

    it('should throw InternalServerErrorException if Prisma transaction fails', async () => {
      signUpMock.mockResolvedValue({
        data: { user: { id: mockUserId, email: validDto.email } },
        error: null,
      });

      prisma.$transaction.mockRejectedValue(new Error('DB connection failed'));

      await expect(service.register(validDto)).rejects.toThrow('Failed to complete registration');
    });
  });

  describe('getProfile', () => {
    it('should return profile with church and branch details', async () => {
      const mockProfile = {
        id: mockProfileId,
        user_id: mockUserId,
        church_id: mockChurchId,
        branch_id: 'branch-1',
        role: 'church_admin',
        first_name: 'Adebayo',
        last_name: 'Ogundimu',
        phone: '+234 803 456 7890',
        mfa_enabled: false,
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

      model(prisma, 'profile').findUnique.mockResolvedValue(mockProfile);

      const result = await service.getProfile(mockUserId);

      expect(result.id).toBe(mockProfileId);
      expect(result.userId).toBe(mockUserId);
      expect(result.churchId).toBe(mockChurchId);
      expect(result.role).toBe('church_admin');
      expect(result.church?.name).toBe('Grace Community Church');
      expect(result.branch?.name).toBe('Headquarters');

      expect(model(prisma, 'profile').findUnique).toHaveBeenCalledWith({
        where: { user_id: mockUserId },
        include: expect.objectContaining({
          church: expect.any(Object),
          branch: expect.any(Object),
        }),
      });
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent-user')).rejects.toThrow(NotFoundException);
    });

    it('should handle profile without branch', async () => {
      const mockProfile = {
        id: mockProfileId,
        user_id: mockUserId,
        church_id: mockChurchId,
        branch_id: null,
        role: 'member',
        first_name: 'Chioma',
        last_name: 'Nwosu',
        phone: null,
        mfa_enabled: false,
        church: {
          id: mockChurchId,
          name: 'Grace Community Church',
          denomination: 'Pentecostal',
          logo_url: null,
        },
        branch: null,
      };

      model(prisma, 'profile').findUnique.mockResolvedValue(mockProfile);

      const result = await service.getProfile(mockUserId);

      expect(result.branchId).toBeUndefined();
      expect(result.branch).toBeUndefined();
      expect(result.phone).toBeUndefined();
    });
  });
});
