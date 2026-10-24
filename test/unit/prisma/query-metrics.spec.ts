import { ForbiddenException, Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../../src/common/filters/global-exception.filter';
import {
  measureStage,
  queryMetrics,
  QueryMetrics,
  serverTiming,
} from '../../../src/prisma/query-metrics';

describe('Request timing isolation', () => {
  it('records timing on failed operations and never shares timing across requests', async () => {
    const metrics = (): QueryMetrics => ({
      queries: 0,
      milliseconds: 0,
      startedAt: performance.now(),
    });
    const a = metrics(),
      b = metrics();
    await Promise.all([
      queryMetrics.run(a, async () => {
        await expect(
          measureStage('session', async () => {
            throw new Error('failure');
          }),
        ).rejects.toThrow('failure');
      }),
      queryMetrics.run(b, () => measureStage('profile', async () => 42)),
    ]);
    expect(a.stages).toHaveProperty('session');
    expect(a.stages).not.toHaveProperty('profile');
    expect(b.stages).toHaveProperty('profile');
    expect(b.stages).not.toHaveProperty('session');
  });
});

describe('Failed request timing', () => {
  it('keeps timing available when a guard rejects before interceptors run', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = {
      headersSent: false,
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    await queryMetrics.run(
      { queries: 1, milliseconds: 3, startedAt: performance.now() },
      async () => {
        let failure;
        try {
          await measureStage('session', async () => {
            throw new ForbiddenException('Denied');
          });
        } catch (error) {
          failure = error;
        }
        new GlobalExceptionFilter().catch(failure, {
          switchToHttp: () => ({
            getRequest: () => ({ url: '/members', method: 'GET' }),
            getResponse: () => response,
          }),
        } as never);
      },
    );
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringContaining('session;dur='),
    );
  });
});

describe('Runtime diagnostic metadata', () => {
  it('reports the observed pool budget and Redis driver without accepting unsafe region text', () => {
    const previous = process.env.VERCEL_REGION;
    try {
      const metrics: QueryMetrics = {
        queries: 1,
        milliseconds: 2,
        startedAt: 0,
        pool: { max: 2, total: 1, idle: 0, waiting: 0 },
        redisDriver: 'upstash-rest',
      };
      process.env.VERCEL_REGION = 'lhr1';
      const header = serverTiming(metrics, 3);
      expect(header).toContain('pool_max;desc="2"');
      expect(header).toContain('redis_driver;desc="upstash-rest"');
      expect(header).toContain('runtime_region;desc="lhr1"');
      process.env.VERCEL_REGION = 'invalid";region';
      expect(serverTiming(metrics, 3)).not.toContain('runtime_region');
    } finally {
      if (previous === undefined) delete process.env.VERCEL_REGION;
      else process.env.VERCEL_REGION = previous;
    }
  });
});
