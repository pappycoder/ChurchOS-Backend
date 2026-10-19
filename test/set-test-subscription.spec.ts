import { Prisma, PrismaClient } from '@prisma/client';
import {
  parseOptions,
  setTestSubscription,
  subscriptionData,
} from '../scripts/set-test-subscription';

const args = ['--church', 'church-a', '--plan', 'community'];
const options = (extra: string[] = []) => {
  const parsed = parseOptions([...args, ...extra]);
  if (parsed.mode !== 'set') throw new Error('Expected set options');
  return parsed;
};

describe('manual test subscription script', () => {
  it('shows help without requiring a database and lists only when explicitly requested', () => {
    expect(parseOptions([])).toEqual({ mode: 'help' });
    expect(parseOptions(['--help'])).toEqual({ mode: 'help' });
    expect(parseOptions(['--list'])).toEqual({ mode: 'list' });
    expect(() => parseOptions(['--list', ...args])).toThrow();
  });

  it.each([
    ['--plan', 'community'],
    ['--church', 'church-a', '--plan', 'invalid'],
    [...args, '--cycle', 'weekly'],
    [...args, '--expired', '--days', '30'],
    [...args, '--days', '0'],
    [...args, '--days', '1.5'],
    [...args, '--members', '300'],
    [...args, '--all'],
    ['--church', 'church-a', '--plan', 'enterprise'],
  ])('rejects unsafe or ambiguous arguments: %j', (...input: string[]) => {
    expect(() => parseOptions(input)).toThrow();
  });

  it('uses calendar billing dates and clears pending changes and enterprise limits', () => {
    const data = subscriptionData(options(), new Date('2026-01-31T12:00:00Z'));
    expect(data.paid_until.toISOString()).toBe('2026-02-28T12:00:00.000Z');
    expect(data).toMatchObject({
      plan: 'community',
      cycle: 'monthly',
      scheduled_plan: null,
      scheduled_cycle: null,
      enterprise_limits: Prisma.DbNull,
    });
    expect(
      subscriptionData(
        options(['--cycle', 'annual']),
        new Date('2026-01-31T12:00:00Z'),
      ).paid_until.toISOString(),
    ).toBe('2027-01-31T12:00:00.000Z');
  });

  it('supports explicit active duration and expired access', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    expect(subscriptionData(options(['--days', '7']), now).paid_until.toISOString()).toBe(
      '2026-10-26T12:00:00.000Z',
    );
    const expired = subscriptionData(options(['--expired']), now);
    expect(expired.paid_until.getTime()).toBeLessThan(now.getTime());
    expect(expired.period_started_at.getTime()).toBeLessThan(expired.paid_until.getTime());
  });

  it('requires complete enterprise limits and disallows invalid values', () => {
    const enterprise = [
      '--church',
      'church-a',
      '--plan',
      'enterprise',
      '--members',
      '5000',
      '--staff',
      '50',
      '--locations',
      '10',
    ];
    const parsed = parseOptions(enterprise);
    expect(parsed.mode === 'set' && parsed.limits).toEqual({
      members: 5000,
      staff: 50,
      locations: 10,
    });
    expect(() => parseOptions([...enterprise, '--staff', '-1'])).toThrow();
    expect(() => parseOptions([...enterprise, '--staff', '2147483648'])).toThrow();
  });

  function database(found = true) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      church: {
        findFirst: jest.fn().mockResolvedValue(
          found
            ? {
                id: 'church-a',
                name: 'Test church',
                subscription: null,
              }
            : null,
        ),
      },
      subscriptionPayment: { count: jest.fn().mockResolvedValue(1) },
      platformSubscription: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    return { prisma: prisma as unknown as PrismaClient, tx };
  }

  it('updates only the selected active church, including a first subscription, without a payment write', async () => {
    const { prisma, tx } = database();
    const result = await setTestSubscription(prisma, options());
    expect(tx.church.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'church-a', archived_at: null },
      }),
    );
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('church-a');
    expect(tx.platformSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { church_id: 'church-a' },
        create: expect.objectContaining({ church_id: 'church-a', plan: 'community' }),
        update: expect.objectContaining({ plan: 'community', scheduled_plan: null }),
      }),
    );
    expect(tx.subscriptionPayment.count).toHaveBeenCalledWith({
      where: { church_id: 'church-a', status: 'pending' },
    });
    expect(result.pendingPayments).toBe(1);
  });

  it('never writes during a dry run', async () => {
    const { prisma, tx } = database();
    await setTestSubscription(prisma, options(['--dry-run']));
    expect(tx.platformSubscription.upsert).not.toHaveBeenCalled();
  });

  it('rejects missing/archived churches without creating a subscription', async () => {
    const { prisma, tx } = database(false);
    await expect(setTestSubscription(prisma, options())).rejects.toThrow('Active church not found');
    expect(tx.platformSubscription.upsert).not.toHaveBeenCalled();
  });
});
