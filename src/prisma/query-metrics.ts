import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

export interface QueryMetrics {
  queries: number;
  milliseconds: number;
  startedAt: number;
  stages?: Record<string, number>;
  pool?: { max: number; total: number; idle: number; waiting: number };
  redisDriver?: 'upstash-rest' | 'ioredis';
}
export const queryMetrics = new AsyncLocalStorage<QueryMetrics>();
export async function measureStage<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const metrics = queryMetrics.getStore();
  if (!metrics) return operation();
  const started = performance.now();
  try {
    return await operation();
  } finally {
    metrics.stages ??= {};
    metrics.stages[name] = (metrics.stages[name] ?? 0) + performance.now() - started;
  }
}

/** Durations overlap; driver time and stage time are not additive. */
export function serverTiming(metrics: QueryMetrics | undefined, duration: number) {
  return [
    `app;dur=${Math.round(duration)}`,
    `db;dur=${Math.round(metrics?.milliseconds ?? 0)}`,
    `db_queries;desc="${metrics?.queries ?? 0}"`,
    `pool_waiting;desc="${metrics?.pool?.waiting ?? 0}"`,
    ...(metrics?.pool ? [`pool_max;desc="${metrics.pool.max}"`] : []),
    ...(metrics?.redisDriver ? [`redis_driver;desc="${metrics.redisDriver}"`] : []),
    ...(process.env.VERCEL_REGION && /^[a-z0-9-]{1,20}$/.test(process.env.VERCEL_REGION)
      ? [`runtime_region;desc="${process.env.VERCEL_REGION}"`]
      : []),
    ...Object.entries(metrics?.stages ?? {}).map(([name, ms]) => `${name};dur=${Math.round(ms)}`),
  ].join(', ');
}

type Connection = Awaited<ReturnType<PrismaPg['connect']>>;

function instrument<T extends Pick<Connection, 'queryRaw' | 'executeRaw'>>(
  connection: T,
  pool: Pool,
): T {
  const samplePool = () => {
    const metrics = queryMetrics.getStore();
    if (metrics)
      metrics.pool = {
        max: pool.options.max ?? 10,
        total: Math.max(metrics.pool?.total ?? 0, pool.totalCount),
        idle: Math.max(metrics.pool?.idle ?? 0, pool.idleCount),
        waiting: Math.max(metrics.pool?.waiting ?? 0, pool.waitingCount),
      };
  };
  const queryRaw = connection.queryRaw.bind(connection);
  const executeRaw = connection.executeRaw.bind(connection);
  connection.queryRaw = async (query) => {
    const metrics = queryMetrics.getStore();
    const start = performance.now();
    if (metrics) metrics.queries++;
    try {
      const result = queryRaw(query);
      samplePool();
      return await result;
    } finally {
      if (metrics) metrics.milliseconds += performance.now() - start;
    }
  };
  connection.executeRaw = async (query) => {
    const metrics = queryMetrics.getStore();
    const start = performance.now();
    if (metrics) metrics.queries++;
    try {
      const result = executeRaw(query);
      samplePool();
      return await result;
    } finally {
      if (metrics) metrics.milliseconds += performance.now() - start;
    }
  };
  return connection;
}

/** Record timings and query counts without logging SQL or bound member data. */
export class InstrumentedPrismaPg extends PrismaPg {
  async connect(): Promise<Connection> {
    const base = await super.connect();
    const pool = base.underlyingDriver();
    const connection = instrument(base, pool);
    const startTransaction = connection.startTransaction.bind(connection);
    connection.startTransaction = async (isolation) =>
      instrument(await startTransaction(isolation), pool);
    return connection;
  }
}
