/**
 * @file audit-logging.service.spec.ts
 * @description Unit tests for AuditLoggingService, including the CRUD
 * notification hook that mirrors every user mutation with an in-app
 * notification for the acting user.
 */

import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';

function createPrismaMock() {
  const audio: Record<string, jest.Mock> = {
    create: jest.fn(),
    findMany: jest.fn(),
  };
  const profile: Record<string, jest.Mock> = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  };
  const notification: Record<string, jest.Mock> = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === 'auditLog') return audio;
      if (prop === 'profile') return profile;
      if (prop === 'notification') return notification;
      return { create: jest.fn(), findMany: jest.fn() };
    },
  };

  return {
    prisma: new Proxy(
      {} as Record<string, unknown>,
      handler,
    ) as unknown as import('../../../src/prisma/prisma.service').PrismaService,
    audio,
    profile,
    notification,
  };
}

function createNotificationsMock() {
  const createNotification = jest.fn().mockResolvedValue({ id: 'n-1' });
  return {
    service: { createNotification } as never,
    createNotification,
  } as unknown as {
    service: import('../../../src/notifications/notifications.service').NotificationsService;
    createNotification: jest.Mock;
  };
}

function createModuleRefMock(service: unknown) {
  return {
    get: jest.fn().mockReturnValue(service),
  } as unknown as import('@nestjs/core').ModuleRef;
}

const churchId = '00000000-0000-0000-0000-000000000001';
const userId = 'auth-sub-123';
const profileId = '22222222-2222-2222-2222-222222222222';

describe('AuditLoggingService', () => {
  let mocks: ReturnType<typeof createPrismaMock>;
  let notify: ReturnType<typeof createNotificationsMock>;
  let service: AuditLoggingService;

  beforeEach(() => {
    mocks = createPrismaMock();
    notify = createNotificationsMock();
    service = new AuditLoggingService(mocks.prisma, createModuleRefMock(notify.service));
  });

  it('writes the audit log entry', async () => {
    mocks.audio.create.mockResolvedValue({});
    mocks.profile.findUnique.mockResolvedValue({ id: profileId });

    await service.log({
      userId,
      churchId,
      entity: 'member',
      action: 'CREATE',
      entityId: 'm-1',
      newValues: { firstName: 'Ada', lastName: 'Obi' },
    });

    expect(mocks.audio.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          church_id: churchId,
          user_id: userId,
          entity: 'member',
          action: 'CREATE',
          entity_id: 'm-1',
        }),
      }),
    );
  });

  it('creates a CRUD notification for the acting user on CREATE', async () => {
    mocks.audio.create.mockResolvedValue({});
    mocks.profile.findUnique.mockResolvedValue({ id: profileId });

    await service.log({
      userId,
      churchId,
      entity: 'member',
      action: 'CREATE',
      entityId: 'm-1',
      newValues: { firstName: 'Ada', lastName: 'Obi' },
    });

    expect(mocks.profile.findUnique).toHaveBeenCalledWith({
      where: { user_id: userId },
      select: { id: true },
    });
    expect(notify.createNotification).toHaveBeenCalledWith(
      churchId,
      profileId,
      'system',
      'Created Member',
      expect.stringContaining('Ada'),
      expect.objectContaining({ entity: 'member', entityId: 'm-1', action: 'CREATE' }),
    );
  });

  it('creates notifications for UPDATE and DELETE/ARCHIVE/RESTORE', async () => {
    mocks.audio.create.mockResolvedValue({});
    mocks.profile.findUnique.mockResolvedValue({ id: profileId });

    for (const action of ['UPDATE', 'DELETE', 'ARCHIVE', 'RESTORE'] as const) {
      await service.log({
        userId,
        churchId,
        entity: 'giving_category',
        action,
        entityId: `id-${action}`,
        newValues: { name: 'Tithe' },
      });
    }

    expect(notify.createNotification).toHaveBeenCalledTimes(4);
    expect(notify.createNotification).toHaveBeenCalledWith(
      churchId,
      profileId,
      'system',
      'Updated Giving Category',
      expect.stringContaining('Tithe'),
      expect.objectContaining({ action: 'UPDATE' }),
    );
  });

  it('does NOT notify for LOGIN/LOGOUT/EXPORT', async () => {
    mocks.audio.create.mockResolvedValue({});
    mocks.profile.findUnique.mockResolvedValue({ id: profileId });

    await service.log({ userId, churchId, entity: 'session', action: 'LOGIN' });
    await service.log({ userId, churchId, entity: 'session', action: 'LOGOUT' });
    await service.log({ userId, churchId, entity: 'members', action: 'EXPORT' });

    expect(notify.createNotification).not.toHaveBeenCalled();
  });

  it('skips notification when the user has no profile', async () => {
    mocks.audio.create.mockResolvedValue({});
    mocks.profile.findUnique.mockResolvedValue(null);

    await service.log({ userId, churchId, entity: 'member', action: 'CREATE', entityId: 'm-1' });

    expect(notify.createNotification).not.toHaveBeenCalled();
  });

  it('swallows notification failures without throwing', async () => {
    mocks.audio.create.mockResolvedValue({});
    mocks.profile.findUnique.mockRejectedValue(new Error('db down'));

    await expect(
      service.log({ userId, churchId, entity: 'member', action: 'CREATE', entityId: 'm-1' }),
    ).resolves.toBeUndefined();
  });
});
