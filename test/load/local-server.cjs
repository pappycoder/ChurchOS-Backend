/* Isolated HTTP + real service/Prisma baseline. This is NOT the production app. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const target = new URL(process.env.TEST_DATABASE_URL || '');
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  !/test/i.test(target.pathname)
)
  throw new Error('TEST_DATABASE_URL must name a local isolated test database');
process.env.DATABASE_URL = target.toString();
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_ANON_KEY = 'local-capacity-fixture';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-capacity-fixture';
process.env.REDIS_URL = 'redis://127.0.0.1:1';
for (const key of Object.keys(process.env)) {
  if (/^(RESEND_|OPENAI_|TERMII_|TWILIO_|PAYSTACK_|FLUTTERWAVE_|SENTRY_|UPSTASH_)/.test(key))
    delete process.env[key];
}
const nativeFetch = global.fetch;
global.fetch = (url, options) => {
  const hostname = new URL(typeof url === 'string' ? url : (url.url ?? String(url))).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname))
    throw new Error('External fetch disabled in local capacity baseline');
  return nativeFetch(url, options);
};
require('ts-node').register({
  transpileOnly: true,
  project: path.join(__dirname, '../../tsconfig.json'),
});
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { Module, Logger } = require('@nestjs/common');
const compression = require('compression');
const helmet = require('helmet');
const { PrismaService } = require('../../src/prisma/prisma.service');
const { RequestContextService } = require('../../src/common/services/request-context.service');
const { BranchScopeService } = require('../../src/common/services/branch-scope.service');
const { MembersService } = require('../../src/members/members.service');
const { VisitorsService } = require('../../src/visitors/visitors.service');
const { AttendanceService } = require('../../src/attendance/attendance.service');
const { ReportsService } = require('../../src/reports/reports.service');
const { queryMetrics } = require('../../src/prisma/query-metrics');
Logger.overrideLogger(['error']);
const prisma = new PrismaService();
const context = new RequestContextService();
const scope = new BranchScopeService(context);
const audit = {
  log: () => {
    throw new Error('Writes are outside this read-only baseline');
  },
};
const members = new MembersService(prisma, context, audit, {}, scope);
const visitors = new VisitorsService(prisma, audit, context);
const attendance = new AttendanceService(prisma, context, audit, scope);
const reports = new ReportsService(prisma);
const fixtureChurches = [];
const sessions = [];
const runId = crypto.randomUUID();
const output = path.join(__dirname, 'results');
const loop = monitorEventLoopDelay({ resolution: 20 });
let stats,
  active = 0,
  cpuStart,
  timeStart;
function resetStats() {
  stats = {
    requests: 0,
    errors: 0,
    peakActiveRequests: 0,
    queries: 0,
    queryMilliseconds: 0,
    peakRssBytes: process.memoryUsage().rss,
  };
  cpuStart = process.cpuUsage();
  timeStart = performance.now();
  loop.reset();
}
async function seed() {
  const tenantCount = Number(process.env.LOAD_TENANTS || 10);
  const perTenant = Number(process.env.LOAD_MEMBERS || 1000);
  if (
    !Number.isInteger(tenantCount) ||
    tenantCount < 1 ||
    tenantCount > 20 ||
    !Number.isInteger(perTenant) ||
    perTenant < 20 ||
    perTenant > 2000
  )
    throw new Error('Invalid bounded fixture size');
  for (let t = 0; t < tenantCount; t++) {
    const church = await prisma.church.create({ data: { name: `CAPACITY TEST ${runId} ${t}` } });
    fixtureChurches.push(church.id);
    await prisma.platformSubscription.create({
      data: {
        church_id: church.id,
        plan: 'network',
        cycle: 'monthly',
        paid_until: new Date('2099-01-01'),
      },
    });
    const branch = await prisma.branch.create({
      data: { church_id: church.id, name: 'Capacity fixture branch' },
    });
    await prisma.member.createMany({
      data: Array.from({ length: perTenant }, (_, i) => ({
        church_id: church.id,
        branch_id: branch.id,
        first_name: `Member${i}`,
        last_name: `Fixture${t}`,
        email: `member-${t}-${i}@capacity.example.test`,
        gender: i % 2 ? 'male' : 'female',
      })),
    });
    await prisma.visitor.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({
        church_id: church.id,
        branch_id: branch.id,
        first_name: `Visitor${i}`,
        last_name: `Fixture${t}`,
      })),
    });
    await prisma.service.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        church_id: church.id,
        branch_id: branch.id,
        name: `Fixture service ${i}`,
        category: 'mixed',
        day_of_week: 0,
      })),
    });
    const category = await prisma.givingCategory.create({
      data: { church_id: church.id, name: 'Capacity fixture offering' },
    });
    await prisma.transaction.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({
        church_id: church.id,
        branch_id: branch.id,
        category_id: category.id,
        amount: 1000 + i,
        currency: 'NGN',
        type: 'cash',
        payment_gateway: 'manual',
        status: 'success',
        giving_date: new Date(`2026-${String((i % 10) + 1).padStart(2, '0')}-15`),
      })),
    });
    for (let u = 0; u < 100; u++)
      sessions.push({
        token: crypto.randomBytes(24).toString('hex'),
        churchId: church.id,
        branchId: branch.id,
      });
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'local.sessions.json'), JSON.stringify(sessions), {
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(output, 'local-environment.json'),
    JSON.stringify(
      {
        runId,
        recordedAt: new Date().toISOString(),
        scope:
          'isolated HTTP service/database baseline; excludes production auth/permissions/Redis/Next proxy/providers/Vercel scaling',
        tenants: tenantCount,
        members: tenantCount * perTenant,
        visitors: tenantCount * 200,
        transactions: tenantCount * 1000,
        services: tenantCount * 3,
        poolMax: process.env.DB_POOL_MAX || 10,
        node: process.version,
        cpusVisible: os.availableParallelism(),
        cpuModel: os.cpus()[0]?.model,
        totalHostMemoryBytes: os.totalmem(),
        platform: os.platform(),
      },
      null,
      2,
    ),
  );
}
async function cleanup() {
  for (const churchId of fixtureChurches) {
    await prisma.transaction.deleteMany({ where: { church_id: churchId } });
    await prisma.visitor.deleteMany({ where: { church_id: churchId } });
    await prisma.member.deleteMany({ where: { church_id: churchId } });
    await prisma.service.deleteMany({ where: { church_id: churchId } });
    await prisma.givingCategory.deleteMany({ where: { church_id: churchId } });
    await prisma.branch.deleteMany({ where: { church_id: churchId } });
    await prisma.platformSubscription.deleteMany({ where: { church_id: churchId } });
    await prisma.auditLog.deleteMany({ where: { church_id: churchId } });
    await prisma.church.delete({ where: { id: churchId } });
  }
  await prisma.$disconnect();
  fs.rmSync(path.join(output, 'local.sessions.json'), { force: true });
}
async function main() {
  await prisma.$connect();
  const cleanupArg = process.argv.find((arg) => arg.startsWith('--cleanup-run='));
  if (cleanupArg) {
    const id = cleanupArg.slice('--cleanup-run='.length);
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid cleanup run id');
    const churches = await prisma.church.findMany({
      where: { name: { startsWith: `CAPACITY TEST ${id} ` } },
      select: { id: true },
    });
    fixtureChurches.push(...churches.map((church) => church.id));
    await cleanup();
    console.log(`Removed ${churches.length} local fixture churches`);
    return;
  }
  await seed();
  const tokens = new Map(sessions.map((s) => [s.token, s]));
  class LocalCapacityModule {}
  Module({})(LocalCapacityModule);
  const app = await NestFactory.create(LocalCapacityModule, { logger: false });
  app.use(helmet());
  app.use(compression());
  resetStats();
  loop.enable();
  app.use(async (req, res) => {
    if (req.url.startsWith('/__load/metrics')) {
      if (req.url.includes('reset=1')) resetStats();
      const cpu = process.cpuUsage(cpuStart);
      return res.json({
        ...stats,
        activeRequests: active,
        elapsedSeconds: (performance.now() - timeStart) / 1000,
        cpuPercentOfOneCore: (cpu.user + cpu.system) / ((performance.now() - timeStart) * 10),
        loopP95Ms: loop.percentile(95) / 1e6,
        rssBytes: process.memoryUsage().rss,
      });
    }
    const session = tokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!session || req.method !== 'GET') return res.status(401).json({ success: false });
    const viewer = {
      church_id: session.churchId,
      branch_id: session.branchId,
      role: 'church_admin',
      is_admin_hq: true,
    };
    const metric = { queries: 0, milliseconds: 0, startedAt: performance.now() };
    active++;
    stats.peakActiveRequests = Math.max(stats.peakActiveRequests, active);
    try {
      const data = await context.run(
        {
          userId: '00000000-0000-4000-8000-000000000001',
          churchId: session.churchId,
          role: 'church_admin',
          viewer,
        },
        () =>
          queryMetrics.run(metric, async () => {
            const q = {
              page: Math.min(10, Math.max(1, Number(req.query.page) || 1)),
              limit: 20,
              ...(req.query.search ? { search: String(req.query.search).slice(0, 100) } : {}),
            };
            switch (req.path) {
              case '/api/v1/members':
                return members.listMembers(session.churchId, q, ['members:sensitive:read'], viewer);
              case '/api/v1/visitors':
                return visitors.findAll(session.churchId, q, viewer);
              case '/api/v1/services':
                return attendance.listServices(session.churchId, q, viewer);
              case '/api/v1/reports/financial':
                return reports.getFinancialReport(
                  session.churchId,
                  '2026-01-01',
                  '2026-12-31',
                  undefined,
                  'NGN',
                );
              default:
                throw new Error('Workload route not found');
            }
          }),
      );
      res.json({ success: true, data });
    } catch (error) {
      stats.errors++;
      res.status(500).json({ success: false, error: error.message });
    } finally {
      active--;
      stats.requests++;
      stats.queries += metric.queries;
      stats.queryMilliseconds += metric.milliseconds;
      stats.peakRssBytes = Math.max(stats.peakRssBytes, process.memoryUsage().rss);
    }
  });
  const port = Number(process.env.LOAD_PORT || 4311);
  await app.listen(port, '127.0.0.1');
  console.log(
    `Local fixture ready at http://127.0.0.1:${port}/api/v1; ${fixtureChurches.length} tenants, real PostgreSQL, fixture-only sessions`,
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    loop.disable();
    await cleanup();
    process.exit(0);
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}
main().catch(async (error) => {
  console.error(error.message);
  await cleanup();
  process.exitCode = 1;
});
