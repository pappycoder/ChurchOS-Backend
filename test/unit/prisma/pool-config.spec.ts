import { databasePoolSettings } from '../../../src/prisma/pool-config';

describe('Database connection budgets', () => {
  it('keeps conservative serverless defaults and a separate persistent-process budget', () => {
    expect(databasePoolSettings({ VERCEL: '1', DB_POOL_MAX: '50' })).toMatchObject({
      max: 1,
      idleTimeoutMillis: 1000,
    });
    expect(databasePoolSettings({ DB_POOL_MAX: '20' })).toMatchObject({
      max: 20,
      idleTimeoutMillis: 10000,
    });
  });
  it('honors explicit serverless limits and existing timeout overrides', () => {
    expect(
      databasePoolSettings({
        VERCEL: '1',
        DB_SERVERLESS_POOL_MAX: '2',
        DB_IDLE_TIMEOUT_MS: '5000',
        DB_CONNECT_TIMEOUT_MS: '4000',
      }),
    ).toMatchObject({ max: 2, idleTimeoutMillis: 5000, connectionTimeoutMillis: 4000 });
  });
  it.each(['', '0', '11', '2.5', 'NaN', '-1'])('rejects unsafe serverless budgets: %s', (value) => {
    expect(() => databasePoolSettings({ VERCEL: '1', DB_SERVERLESS_POOL_MAX: value })).toThrow(
      'DB_SERVERLESS_POOL_MAX',
    );
  });
});
