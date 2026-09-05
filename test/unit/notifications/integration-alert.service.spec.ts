/**
 * @file integration-alert.service.spec.ts
 * @description Unit tests for IntegrationAlertService.
 *
 * Verifies fire-and-forget alerting for external integration failures:
 * admin targeting, notification fan-out, no-op when no admins exist, and
 * that failures are swallowed (never thrown back to the caller).
 *
 * @module test/unit/notifications/integration-alert.service.spec
 * @since 1.0.0
 */

import { IntegrationAlertService } from '../../../src/notifications/integration-alert.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('IntegrationAlertService', () => {
  let service: IntegrationAlertService;
  let prisma: { profile: { findMany: jest.Mock } };
  let notifications: { createNotification: jest.Mock };

  const mockChurchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const superAdminId = '11111111-1111-1111-1111-111111111111';
  const churchAdminId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    prisma = {
      profile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    notifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };
    service = new IntegrationAlertService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('should be a no-op when churchId is empty', async () => {
    await service.notify('', 'resend', 't', 'm');
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
  });

  it('should create a system alert for each super_admin and church_admin', async () => {
    prisma.profile.findMany.mockResolvedValue([{ id: superAdminId }, { id: churchAdminId }]);

    await service.notify(mockChurchId, 'termii', 'Termii send failed', 'Could not deliver SMS');

    expect(prisma.profile.findMany).toHaveBeenCalledWith({
      where: { church_id: mockChurchId, role: { hasSome: ['super_admin', 'church_admin'] } },
      select: { id: true },
    });
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      mockChurchId,
      superAdminId,
      'system',
      'Termii send failed',
      'Could not deliver SMS',
      { integration: 'termii' },
    );
    expect(notifications.createNotification).toHaveBeenCalledWith(
      mockChurchId,
      churchAdminId,
      'system',
      'Termii send failed',
      'Could not deliver SMS',
      { integration: 'termii' },
    );
  });

  it('should merge caller data into the notification payload', async () => {
    prisma.profile.findMany.mockResolvedValue([{ id: superAdminId }]);

    await service.notify(mockChurchId, 'paystack', 'Paystack init failed', 'down', {
      reference: 'REFO',
      amount: 5000,
    });

    expect(notifications.createNotification).toHaveBeenCalledWith(
      mockChurchId,
      superAdminId,
      'system',
      'Paystack init failed',
      'down',
      { integration: 'paystack', reference: 'REFO', amount: 5000 },
    );
  });

  it('should do nothing when no admins exist in the church', async () => {
    prisma.profile.findMany.mockResolvedValue([]);

    await service.notify(mockChurchId, 'resend', 't', 'm');

    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('should swallow a single notification failure without breaking others', async () => {
    prisma.profile.findMany.mockResolvedValue([{ id: superAdminId }, { id: churchAdminId }]);
    notifications.createNotification
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({});

    await expect(service.notify(mockChurchId, 'resend', 't', 'm')).resolves.toBeUndefined();
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
  });

  it('should swallow an admin-query failure entirely', async () => {
    prisma.profile.findMany.mockRejectedValue(new Error('db down'));

    await expect(service.notify(mockChurchId, 'flutterwave', 't', 'm')).resolves.toBeUndefined();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
