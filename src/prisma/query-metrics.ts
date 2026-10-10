import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';

export interface QueryMetrics {
  queries: number;
  milliseconds: number;
  startedAt: number;
}
export const queryMetrics = new AsyncLocalStorage<QueryMetrics>();
type Connection = Awaited<ReturnType<PrismaPg['connect']>>;

function instrument<T extends Pick<Connection, 'queryRaw' | 'executeRaw'>>(connection: T): T {
  const queryRaw = connection.queryRaw.bind(connection);
  const executeRaw = connection.executeRaw.bind(connection);
  connection.queryRaw = async (query) => {
    const metrics = queryMetrics.getStore();
    const start = performance.now();
    if (metrics) metrics.queries++;
    try {
      return await queryRaw(query);
    } finally {
      if (metrics) metrics.milliseconds += performance.now() - start;
    }
  };
  connection.executeRaw = async (query) => {
    const metrics = queryMetrics.getStore();
    const start = performance.now();
    if (metrics) metrics.queries++;
    try {
      return await executeRaw(query);
    } finally {
      if (metrics) metrics.milliseconds += performance.now() - start;
    }
  };
  return connection;
}

/** Record timings and query counts without logging SQL or bound member data. */
export class InstrumentedPrismaPg extends PrismaPg {
  async connect(): Promise<Connection> {
    const connection = instrument(await super.connect());
    const startTransaction = connection.startTransaction.bind(connection);
    connection.startTransaction = async (isolation) =>
      instrument(await startTransaction(isolation));
    return connection;
  }
}
