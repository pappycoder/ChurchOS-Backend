/**
 * @file users.service.spec.ts
 * @description Unit tests for UsersService.
 */

import { UsersService } from '../../../src/users/users.service';

function createPrismaMock() {
  const models: Record<string, Record<string, jest.Mock>> = {};
  const $transactionMock = jest.fn();
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === '$transaction') return $transactionMock;
      if (prop === '$queryRaw') return jest.fn().mockResolvedValue([]);
      if (!models[prop]) {
        models[prop] = {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          count: jest.fn(),
          aggregate: jest.fn(),
          groupBy: jest.fn(),
          upsert: jest.fn(),
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

function model(name: string): Record<string, jest.Mock> {
  return prisma[name] as Record<string, jest.Mock>;
}

let prisma: ReturnType<typeof createPrismaMock>;
let audit: { log: jest.Mock };
let config: { get: jest.Mock };
let supabase: { client: { auth: { admin: Record<string, jest.Mock> } } };
let service: UsersService;

const mockChurchId = '00000000-0000-0000-0000-000000000001';
const mockUserId = '11111111-1111-1111-1111-111111111111';
const mockProfileId = '22222222-2222-2222-2222-222222222222';
const mockProfile = {
  id: mockProfileId,
  user_id: mockUserId,
  church_id: mockChurchId,
  branch_id: null,
  role: 'church_admin',
  first_name: 'John',
  last_name: 'Doe',
  phone: '+2348012345678',
  avatar_url: null,
  mfa_enabled: false,
  created_at: new Date('2026-07-15'),
  updated_at: new Date('2026-07-20'),
};

beforeEach(() => {
  prisma = createPrismaMock();
  audit = { log: jest.fn().mockResolvedValue(undefined) };
  config = { get: jest.fn().mockReturnValue('http://localhost:3000') };
  supabase = {
    client: {
      auth: {
        admin: {
          inviteUserByEmail: jest.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
          updateUserById: jest.fn().mockResolvedValue({ error: null }),
          getUserById: jest.fn().mockResolvedValue({
            data: { user: { id: mockUserId, email: 'john@church.com' } },
            error: null,
          }),
          generateLink: jest.fn().mockResolvedValue({ data: {}, error: null }),
          signOut: jest.fn().mockResolvedValue({ error: null }),
        },
      },
    },
  };

  service = new UsersService(
    prisma as unknown as import('../../../src/prisma/prisma.service').PrismaService,
    config as unknown as import('@nestjs/config').ConfigService,
    audit as unknown as import('../../../src/common/services/audit-logging.service').AuditLoggingService,
    supabase as unknown as import('../../../src/supabase/supabase.service').SupabaseService,
  );
});

describe('UsersService', () => {
  describe('listUsers', () => {
    it('should return paginated users', async () => {
      model('profile').findMany.mockResolvedValue([mockProfile]);
      model('profile').count.mockResolvedValue(1);

      const result = await service.listUsers(mockChurchId, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].firstName).toBe('John');
      expect(result.data[0].role).toBe('church_admin');
    });

    it('should filter by role', async () => {
      model('profile').findMany.mockResolvedValue([]);
      model('profile').count.mockResolvedValue(0);

      await service.listUsers(mockChurchId, 1, 20, undefined, 'treasurer');

      expect(model('profile').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'treasurer' }),
        }),
      );
    });

    it('should search by name', async () => {
      model('profile').findMany.mockResolvedValue([]);
      model('profile').count.mockResolvedValue(0);

      await service.listUsers(mockChurchId, 1, 20, 'John');

      expect(model('profile').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                first_name: expect.objectContaining({ contains: 'John' }),
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('getUserById', () => {
    it('should return a user by ID', async () => {
      model('profile').findFirst.mockResolvedValue(mockProfile);

      const result = await service.getUserById(mockProfileId, mockChurchId);

      expect(result.id).toBe(mockProfileId);
      expect(result.firstName).toBe('John');
    });

    it('should throw NotFoundException for unknown user', async () => {
      model('profile').findFirst.mockResolvedValue(null);

      await expect(service.getUserById('unknown', mockChurchId)).rejects.toThrow('User not found');
    });
  });

  describe('inviteUser', () => {
    it('should invite a new user', async () => {
      model('profile').findFirst.mockResolvedValue(null);
      model('profile').create.mockResolvedValue(mockProfile);

      const result = await service.inviteUser(
        {
          email: 'john@church.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'church_admin',
        },
        mockChurchId,
        mockUserId,
      );

      expect(result.firstName).toBe('John');
      expect(supabase.client.auth.admin.inviteUserByEmail).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'user', action: 'CREATE' }),
      );
    });

    it('should throw ConflictException for duplicate phone', async () => {
      model('profile').findFirst.mockResolvedValue({ ...mockProfile, phone: '+2348012345678' });

      await expect(
        service.inviteUser(
          {
            email: 'john@church.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'member',
            phone: '+2348012345678',
          },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow('already exists');
    });

    it('should reject empty email or names', async () => {
      await expect(
        service.inviteUser(
          {
            email: '   ',
            firstName: 'John',
            lastName: 'Doe',
            role: 'member',
          },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow('Email is required');

      await expect(
        service.inviteUser(
          {
            email: 'john@church.com',
            firstName: '   ',
            lastName: 'Doe',
            role: 'member',
          },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow('First name and last name are required');
    });
  });

  describe('updateUser', () => {
    it('should reject empty first or last name', async () => {
      model('profile').findFirst.mockResolvedValue(mockProfile);

      await expect(
        service.updateUser(mockProfileId, mockChurchId, mockUserId, { firstName: '   ' }),
      ).rejects.toThrow('First name cannot be empty');

      await expect(
        service.updateUser(mockProfileId, mockChurchId, mockUserId, { lastName: '   ' }),
      ).rejects.toThrow('Last name cannot be empty');
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate a user', async () => {
      model('profile').findFirst.mockResolvedValue(mockProfile);
      model('profile').update.mockResolvedValue(mockProfile);

      const result = await service.deactivateUser(mockProfileId, mockChurchId, mockUserId);

      expect(result.deactivated).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'user', action: 'DELETE' }),
      );
    });

    it('should throw for super_admin', async () => {
      model('profile').findFirst.mockResolvedValue({ ...mockProfile, role: 'super_admin' });

      await expect(service.deactivateUser(mockProfileId, mockChurchId, mockUserId)).rejects.toThrow(
        'Cannot deactivate',
      );
    });

    it('should throw NotFoundException for unknown user', async () => {
      model('profile').findFirst.mockResolvedValue(null);

      await expect(service.deactivateUser('unknown', mockChurchId, mockUserId)).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('resetUserPassword', () => {
    it('should generate password reset link', async () => {
      model('profile').findFirst.mockResolvedValue(mockProfile);

      const result = await service.resetUserPassword(mockProfileId, mockChurchId, mockUserId);

      expect(result.resetSent).toBe(true);
      expect(supabase.client.auth.admin.generateLink).toHaveBeenCalled();
    });
  });

  describe('forceSignOut', () => {
    it('should force sign-out a user', async () => {
      model('profile').findFirst.mockResolvedValue(mockProfile);

      const result = await service.forceSignOut(mockProfileId, mockChurchId, mockUserId);

      expect(result.signedOut).toBe(true);
      expect(supabase.client.auth.admin.signOut).toHaveBeenCalledWith(mockUserId);
    });
  });
});
