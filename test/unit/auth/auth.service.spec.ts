/**
 * @file auth.service.spec.ts
 * @description Unit tests for AuthService.
 *
 * Tests registration, login, logout, password management, profile updates,
 * and session refresh. All external dependencies (Supabase, Prisma, Redis,
 * AuditLogging) are mocked.
 *
 * @module test/unit/auth/auth.service.spec
 * @since 1.0.0
 */

import { AuthService } from '../../../src/auth/auth.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SupabaseService } from '../../../src/supabase/supabase.service';
import { RedisService } from '../../../src/redis/redis.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { RegisterDto } from '../../../src/auth/dto/register.dto';
import { LoginDto } from '../../../src/auth/dto/login.dto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: Record<string, unknown> & { $transaction: jest.Mock };
  let signUpMock: jest.Mock;
  let signInMock: jest.Mock;
  let updateUserMock: jest.Mock;
  let getUserByIdMock: jest.Mock;
  let adminUpdateUserByIdMock: jest.Mock;
  let refreshSessionMock: jest.Mock;
  let resetPasswordForEmailMock: jest.Mock;
  let signOutMock: jest.Mock;
  let redis: { set: jest.Mock; get: jest.Mock };
  let audit: { log: jest.Mock };
  let config: { get: jest.Mock };

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
    redis = { set: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null) };
    config = { get: jest.fn().mockReturnValue('http://localhost:3000') };

    signUpMock = jest.fn();
    signInMock = jest.fn();
    updateUserMock = jest.fn();
    refreshSessionMock = jest.fn();
    resetPasswordForEmailMock = jest.fn();
    signOutMock = jest.fn().mockResolvedValue({ error: null });
    getUserByIdMock = jest.fn();
    adminUpdateUserByIdMock = jest.fn().mockResolvedValue({ error: null });

    service = new AuthService(
      prisma as unknown as PrismaService,
      {
        client: {
          auth: {
            signUp: signUpMock,
            signInWithPassword: signInMock,
            updateUser: updateUserMock,
            refreshSession: refreshSessionMock,
            resetPasswordForEmail: resetPasswordForEmailMock,
            admin: {
              signOut: signOutMock,
              getUserById: getUserByIdMock,
              updateUserById: adminUpdateUserByIdMock,
            },
          },
        },
      } as unknown as SupabaseService,
      redis as unknown as RedisService,
      audit as unknown as AuditLoggingService,
      config as unknown as ConfigService,
    );
  });

  // ─── REGISTER ──────────────────────────────────────────────────────

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

  // ─── LOGIN ─────────────────────────────────────────────────────────

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'pastor@gracecommunity.com',
      password: 'SecureP@ss123',
    };

    it('should login successfully and return tokens with profile', async () => {
      signInMock.mockResolvedValue({
        data: {
          user: { id: mockUserId, email: loginDto.email },
          session: {
            access_token: 'jwt-access-token',
            refresh_token: 'jwt-refresh-token',
            expires_at: 1700000000,
          },
        },
        error: null,
      });

      model(prisma, 'profile').findUnique.mockResolvedValue({
        id: mockProfileId,
        church_id: mockChurchId,
        branch_id: 'branch-1',
        role: 'church_admin',
        first_name: 'Adebayo',
        last_name: 'Ogundimu',
      });

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('jwt-access-token');
      expect(result.refreshToken).toBe('jwt-refresh-token');
      expect(result.userId).toBe(mockUserId);
      expect(result.email).toBe(loginDto.email);
      expect(result.profile?.role).toBe('church_admin');
      expect(result.profile?.churchId).toBe(mockChurchId);

      expect(signInMock).toHaveBeenCalledWith({
        email: loginDto.email,
        password: loginDto.password,
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          entity: 'auth',
          action: 'LOGIN',
        }),
      );
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      signInMock.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if Supabase returns no user', async () => {
      signInMock.mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should return profile even if user has no profile', async () => {
      signInMock.mockResolvedValue({
        data: {
          user: { id: mockUserId, email: loginDto.email },
          session: {
            access_token: 'jwt-access-token',
            refresh_token: 'jwt-refresh-token',
            expires_at: 1700000000,
          },
        },
        error: null,
      });

      model(prisma, 'profile').findUnique.mockResolvedValue(null);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('jwt-access-token');
      expect(result.profile).toBeUndefined();
    });
  });

  // ─── LOGOUT ────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should blacklist token, revoke Supabase sessions, and audit-log the logout', async () => {
      await service.logout(mockUserId, 'jwt-token', mockChurchId);

      expect(redis.set).toHaveBeenCalledWith('auth:blacklist:jwt-token', mockUserId, 3600);
      expect(signOutMock).toHaveBeenCalledWith(mockUserId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          churchId: mockChurchId,
          entity: 'auth',
          action: 'LOGOUT',
        }),
      );
    });
  });

  // ─── FORGOT PASSWORD ───────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should call Supabase resetPasswordForEmail', async () => {
      resetPasswordForEmailMock.mockResolvedValue({ error: null });

      await service.forgotPassword('pastor@gracecommunity.com');

      expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
        'pastor@gracecommunity.com',
        expect.objectContaining({
          redirectTo: expect.stringContaining('reset-password'),
        }),
      );
    });

    it('should not throw even if Supabase returns an error', async () => {
      resetPasswordForEmailMock.mockResolvedValue({
        error: { message: 'User not found' },
      });

      // Should not throw — prevents email enumeration
      await expect(service.forgotPassword('unknown@email.com')).resolves.toBeUndefined();
    });
  });

  // ─── RESET PASSWORD ────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should update password successfully', async () => {
      updateUserMock.mockResolvedValue({ error: null });

      await expect(
        service.resetPassword('recovery-token', 'NewPassword123!'),
      ).resolves.toBeUndefined();

      expect(updateUserMock).toHaveBeenCalledWith({ password: 'NewPassword123!' });
    });

    it('should throw BadRequestException if token is invalid', async () => {
      updateUserMock.mockResolvedValue({
        error: { message: 'Token expired' },
      });

      await expect(service.resetPassword('expired-token', 'NewPassword123!')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── CHANGE PASSWORD ───────────────────────────────────────────────

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      getUserByIdMock.mockResolvedValue({
        data: { user: { id: mockUserId, email: 'pastor@church.com' } },
        error: null,
      });
      signInMock.mockResolvedValue({ error: null });
      adminUpdateUserByIdMock.mockResolvedValue({ error: null });

      await expect(
        service.changePassword(mockUserId, 'OldPass123!', 'NewPass456!'),
      ).resolves.toBeUndefined();

      expect(getUserByIdMock).toHaveBeenCalledWith(mockUserId);
      expect(signInMock).toHaveBeenCalledWith({
        email: 'pastor@church.com',
        password: 'OldPass123!',
      });
      expect(adminUpdateUserByIdMock).toHaveBeenCalledWith(mockUserId, {
        password: 'NewPass456!',
      });
      expect(signOutMock).toHaveBeenCalledWith(mockUserId);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          entity: 'auth',
          action: 'UPDATE',
        }),
      );
    });

    it('should throw UnauthorizedException if current password is wrong', async () => {
      getUserByIdMock.mockResolvedValue({
        data: { user: { id: mockUserId, email: 'pastor@church.com' } },
        error: null,
      });
      signInMock.mockResolvedValue({
        error: { message: 'Invalid login credentials' },
      });

      await expect(
        service.changePassword(mockUserId, 'WrongPass', 'NewPass456!'),
      ).rejects.toThrow(UnauthorizedException);
      expect(adminUpdateUserByIdMock).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if the account email cannot be resolved', async () => {
      getUserByIdMock.mockResolvedValue({
        data: { user: { id: mockUserId, email: null } },
        error: null,
      });

      await expect(
        service.changePassword(mockUserId, 'OldPass123!', 'NewPass456!'),
      ).rejects.toThrow('Unable to verify your account');
      expect(signInMock).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if password update fails', async () => {
      getUserByIdMock.mockResolvedValue({
        data: { user: { id: mockUserId, email: 'pastor@church.com' } },
        error: null,
      });
      signInMock.mockResolvedValue({ error: null });
      adminUpdateUserByIdMock.mockResolvedValue({
        error: { message: 'Update failed' },
      });

      await expect(
        service.changePassword(mockUserId, 'OldPass123!', 'NewPass456!'),
      ).rejects.toThrow('Failed to update password');
    });
  });

  // ─── REFRESH SESSION ───────────────────────────────────────────────

  describe('refreshSession', () => {
    it('should refresh session successfully', async () => {
      refreshSessionMock.mockResolvedValue({
        data: {
          session: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_at: 1700003600,
          },
        },
        error: null,
      });

      const result = await service.refreshSession('old-refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.expiresAt).toBe(1700003600);
      expect(refreshSessionMock).toHaveBeenCalledWith({
        refresh_token: 'old-refresh-token',
      });
    });

    it('should throw UnauthorizedException if refresh fails', async () => {
      refreshSessionMock.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token expired' },
      });

      await expect(service.refreshSession('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if no session returned', async () => {
      refreshSessionMock.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(service.refreshSession('token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
