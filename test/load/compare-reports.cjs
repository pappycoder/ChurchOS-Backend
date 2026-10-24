/* Local fixture-only microbenchmark. Never a live capacity measurement. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
const url = new URL(process.env.TEST_DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/test/i.test(url.pathname))
  throw new Error('Use an isolated local test database');
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
process.env.DB_POOL_MAX = '1';
require('ts-node').register({
  transpileOnly: true,
  project: path.join(__dirname, '../../tsconfig.json'),
});
require('reflect-metadata');
const { Logger } = require('@nestjs/common');
Logger.overrideLogger(['error']);
const { PrismaService } = require('../../src/prisma/prisma.service');
const { ReportsService: After } = require('../../src/reports/reports.service');
const baselineCommit =
  process.env.BASELINE_REF ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{7,40}$/.test(baselineCommit)) throw new Error('BASELINE_REF must be a commit hash');
const source = execFileSync('git', ['show', `${baselineCommit}:src/reports/reports.service.ts`], {
  encoding: 'utf8',
});
const filename = path.resolve(__dirname, '../../src/reports/__capacity_before.cjs');
const baselineModule = new Module(filename, module);
baselineModule.filename = filename;
baselineModule.paths = Module._nodeModulePaths(path.dirname(filename));
baselineModule._compile(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  }).outputText,
  filename,
);
const Before = baselineModule.exports.ReportsService;
async function main() {
  const prisma = new PrismaService();
  try {
    const [session] = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'results/local.sessions.json')),
    );
    const fixture = await prisma.church.findUnique({
      where: { id: session.churchId },
      select: { name: true },
    });
    if (!fixture?.name.startsWith('CAPACITY TEST '))
      throw new Error('Only existing local capacity fixtures are allowed');
    const dataRows = await prisma.transaction.count({ where: { church_id: session.churchId } });
    const before = new Before(prisma),
      after = new After(prisma);
    const samples = { before: [], after: [] };
    let monthlyRows;
    for (let round = 0; round < 8; round++) {
      let original;
      for (const [name, service] of [
        ['before', before],
        ['after', after],
      ]) {
        const start = performance.now();
        const report = await service.getFinancialReport(
          session.churchId,
          '2026-01-01',
          '2026-12-31',
          undefined,
          'NGN',
        );
        if (round) samples[name].push(performance.now() - start);
        if (name === 'before') original = JSON.stringify(report);
        else if (JSON.stringify(report) !== original)
          throw new Error('Before/after financial output differs');
        monthlyRows = report.monthlyTrend.length;
      }
    }
    const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    const result = {
      scope:
        'Local real-PostgreSQL financial report microbenchmark; excludes auth, Redis, HTTP proxy and production network',
      baselineCommit,
      poolConnections: 1,
      alternatingPairs: 7,
      warmupPairs: 1,
      dataRows,
      monthlyRows,
      samplesMs: samples,
      medianBeforeMs: median(samples.before),
      medianAfterMs: median(samples.after),
      outputsIdentical: true,
    };
    fs.writeFileSync(
      path.join(__dirname, 'results/report-comparison.json'),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
