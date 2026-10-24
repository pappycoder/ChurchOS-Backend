import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTarget, positiveInteger, summarize } from './config.mjs';
import { summarizeTrace } from './trace.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const i = item.indexOf('=');
    if (i < 3 || !item.startsWith('--')) throw new Error('Arguments use --name=value');
    return [item.slice(2, i), item.slice(i + 1)];
  }),
);
const allowedRemote = args['allow-remote'] || '';
const target = validateTarget(args.target || 'http://127.0.0.1:4311/api/v1', allowedRemote);
const mode = args.mode || 'users';
if (!['users', 'rps', 'requests', 'burst'].includes(mode))
  throw new Error('mode must be users, requests, burst or rps');
const levels = (args.levels || '1,10,25,50,100,200')
  .split(',')
  .map((n) => positiveInteger(n, 'level'));
const seconds = positiveInteger(args.seconds || 60, 'seconds', 3600);
const p95 = positiveInteger(args['p95-ms'] || 1000, 'p95-ms', 60000);
const p99 = positiveInteger(args['p99-ms'] || 2000, 'p99-ms', 60000);
if (!['mixed', 'lists', 'live-read'].includes(args.workload || 'mixed'))
  throw new Error('workload must be mixed, lists or live-read');
const sessionsFile = resolve(args.sessions || `${here}/results/local.sessions.json`);
const sessions = JSON.parse(await readFile(sessionsFile, 'utf8'));
if (!Array.isArray(sessions) || !sessions.length) throw new Error('Missing test sessions');
if (
  allowedRemote &&
  mode === 'users' &&
  levels.some(
    (level) => level > new Set(sessions.map((session) => session.profileId || session.token)).size,
  )
)
  throw new Error(
    'Live user-concurrency tests require a distinct authorized account per virtual user; reusing sessions measures clients, not distinct users',
  );
const output = resolve(
  args.output || `${here}/results/${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}`,
);
await mkdir(output, { recursive: true });
const results = [];
for (const level of levels) {
  const summaryFile = resolve(output, `${mode}-${level}.json`);
  const logFile = resolve(output, `${mode}-${level}.log`);
  const allocation = positiveInteger(args.allocation || Math.max(50, level * 2), 'allocation');
  const env = {
    // k6 does not need provider/database credentials or the app .env.
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TARGET: target,
    ALLOW_REMOTE: allowedRemote,
    MODE: mode,
    P95_MS: String(p95),
    P99_MS: String(p99),
    LEVEL: String(level),
    DURATION_SECONDS: String(seconds),
    THINK_SECONDS: args.think || '1',
    SESSIONS_FILE: sessionsFile,
    SUMMARY_FILE: summaryFile,
    ALLOCATION: String(allocation),
    WORKLOAD: args.workload || 'mixed',
    K6_NO_USAGE_REPORT: 'true',
    K6_WEB_DASHBOARD: 'false',
  };
  const traceFile = resolve(output, `${mode}-${level}.trace.jsonl`);
  let log = '';
  let interrupted = false;
  const localMetrics = args['local-metrics'] === 'true';
  if (localMetrics && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(target).hostname))
    throw new Error('Local telemetry requires loopback');
  const metricsUrl = new URL('/__load/metrics', target);
  if (localMetrics) await fetch(`${metricsUrl}?reset=1`);
  const started = Date.now();
  const code = await new Promise((resolveCode, reject) => {
    const child = spawn(
      'k6',
      [
        'run',
        '--quiet',
        '--address',
        '',
        ...(args['trace-events'] === 'true' ? ['--out', `json=${traceFile}`] : []),
        resolve(here, 'capacity.k6.js'),
      ],
      { env },
    );
    const stop = () => {
      interrupted = true;
      child.kill('SIGINT');
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const deadline = setTimeout(() => child.kill('SIGTERM'), (seconds + 45) * 1000);
    child.on('error', (error) => {
      clearTimeout(deadline);
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      reject(error);
    });
    child.stdout.on('data', (bytes) => {
      log += bytes.toString();
    });
    child.stderr.on('data', (bytes) => {
      log += bytes.toString();
    });
    child.on('close', (exitCode) => {
      clearTimeout(deadline);
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      resolveCode(exitCode);
    });
  });
  await writeFile(logFile, log);
  const endedEarly = interrupted || log.includes('stopping test prematurely');
  let row;
  try {
    row = summarize(JSON.parse(await readFile(summaryFile, 'utf8')), {
      scheduledSeconds: seconds,
      mode,
      endedEarly,
    });
  } catch {
    throw new Error(`k6 did not produce a valid summary; inspect ${logFile}`);
  }
  row = {
    mode,
    level,
    endedEarly,
    generatorExitCode: code,
    scheduledSeconds: seconds,
    p95TargetMs: p95,
    p99TargetMs: p99,
    wallSeconds: (Date.now() - started) / 1000,
    ...row,
    passed: row.passed && code === 0 && (mode !== 'burst' || row.requests === level),
  };
  if (args['trace-events'] === 'true')
    Object.assign(row, summarizeTrace(await readFile(traceFile, 'utf8')));
  if (localMetrics) row.server = await (await fetch(metricsUrl)).json();
  results.push(row);
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(
      {
        target,
        mode,
        sessions: sessions.length,
        thinkSeconds: mode === 'users' ? Number(env.THINK_SECONDS) : 0,
        workload: env.WORKLOAD,
        recordedAt: new Date().toISOString(),
        rows: results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(row));
  // Never continue climbing after latency, errors, auth, rate limits or generator limits fail.
  if (!row.passed || interrupted) break;
}
console.log(`Results: ${output}`);

process.exitCode = results.some((row) => !row.passed) ? 1 : 0;
