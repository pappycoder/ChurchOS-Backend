import { readFile, writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import pg from 'pg';
import { Redis } from '@upstash/redis';
import IORedis from 'ioredis';
const env = dotenv.parse(await readFile('.env'));
const url = new URL(env.DATABASE_URL);
const portBefore = url.port || '5432';
if (url.hostname.endsWith('.pooler.supabase.com') && (!url.port || url.port === '5432')) {
  url.port = '6543';
  url.searchParams.set('pgbouncer', 'true');
}
const started = performance.now();
const client = new pg.Client({
  connectionString: url.toString(),
  connectionTimeoutMillis: 15000,
  statement_timeout: 5000,
});
await client.connect();
const connectionMs = performance.now() - started;
const queryMs = [];
try {
  await client.query('BEGIN READ ONLY');
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await client.query('SELECT 1');
    queryMs.push(performance.now() - start);
  }
  const session = JSON.parse(await readFile('test/load/results/live.sessions.json'))[0];
  const plan = await client.query(
    'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM members WHERE church_id=$1 ORDER BY created_at DESC LIMIT 20',
    [session.churchId],
  );
  const explain = plan.rows[0]['QUERY PLAN'][0];
  const record = {
    scope:
      'Configured local .env remote dependencies measured from this test machine, not from a Vercel function',
    database: {
      provider: url.hostname.endsWith('.pooler.supabase.com') ? 'Supabase pooler' : 'other',
      regionHint:
        url.hostname.match(
          /(?:eu|us|ap|ca|sa|af|me)-(?:north|south|east|west|central|northeast|northwest|southeast|southwest)-\d/,
        )?.[0] ?? null,
      configuredPort: portBefore,
      diagnosticPort: url.port,
      connectionMs,
      selectOneMs: queryMs,
      memberQueryExecutionMs: explain['Execution Time'],
      memberQueryPlanningMs: explain['Planning Time'],
      memberPlanNode: explain.Plan['Node Type'],
    },
  };
  if (env.REDIS_URL?.startsWith('https://') && env.UPSTASH_REDIS_TOKEN) {
    const redis = new Redis({ url: env.REDIS_URL, token: env.UPSTASH_REDIS_TOKEN });
    const pingMs = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await redis.ping();
      pingMs.push(performance.now() - start);
    }
    record.redis = { driver: 'Upstash REST', pingMs };
  }
  const redisIsLoopback =
    env.REDIS_URL && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.REDIS_URL).hostname);
  if (redisIsLoopback)
    record.redis = {
      driver: 'ioredis TCP',
      status: 'Local loopback configuration; cannot measure deployed Redis',
    };
  if (env.REDIS_URL && !env.REDIS_URL.startsWith('https://') && !redisIsLoopback) {
    const redis = new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 8000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      const pingMs = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await redis.ping();
        pingMs.push(performance.now() - start);
      }
      record.redis = { driver: 'ioredis TCP', pingMs };
    } catch {
      record.redis = { driver: 'ioredis TCP', status: 'Unavailable from diagnostic machine' };
    } finally {
      redis.disconnect();
    }
  }
  await writeFile('test/load/results/dependency-diagnostics.json', JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
