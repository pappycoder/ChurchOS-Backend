#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('./core.cjs');
const root = path.resolve(__dirname, '../..');
const web = require(path.join(root, 'package.json')).name === 'churchos-web';
const actions = require('./actions.cjs');
const [file, manager, mode, action] = process.argv.slice(2);
function definition(id) {
  const value = actions.find((item) => item.id === id);
  if (!value) throw new core.ConsoleError('Unknown action. Use --list to see supported actions.');
  return value;
}
function context() {
  return core.loadEnvironment(root, file);
}
function commands(item, _ctx, value) {
  const pm = core.managerCommands(manager);
  const script = (name, args) => pm.script(name, args);
  const bin = (name, ...args) => [path.join(root, 'node_modules/.bin', name), ...args];
  const mapping = {
    install: [pm.install],
    build: [script('build')],
    dev: [
      script(
        web ? 'dev' : 'start:dev',
        web ? ['--hostname', '127.0.0.1', '--port', value || '3000'] : [],
      ),
    ],
    start: [
      script(
        web ? 'start' : 'start:prod',
        web ? ['--hostname', '127.0.0.1', '--port', value || '3000'] : [],
      ),
    ],
    worker: [script('start:worker')],
    lint: [bin('eslint', ...(web ? ['.'] : ['{src,test,scripts,prisma}/**/*.ts']))],
    'lint-fix': [bin('eslint', ...(web ? ['.'] : ['{src,test,scripts,prisma}/**/*.ts']), '--fix')],
    typecheck: [bin('tsc', '--noEmit')],
    test: [script('test', web ? [] : ['--runInBand'])],
    'test-browser': [script('test:e2e')],
    'browser-install': [bin('playwright', 'install', 'chromium')],
    'test-integration': [script('test:e2e', ['--runInBand'])],
    'console-test': [['node', '--test', 'test/ops/console.test.cjs']],
    'audit-ui': [script('audit:ui')],
    'dependency-audit': [[manager, 'audit', ...(manager === 'npm' ? ['--omit=dev'] : ['--prod'])]],
    'prisma-generate': [bin('prisma', 'generate')],
    'migration-status': [bin('prisma', 'migrate', 'status')],
    'migration-deploy': [bin('prisma', 'migrate', 'deploy')],
    'migration-dev': [bin('prisma', 'migrate', 'dev', '--name', value || 'update')],
    'prisma-studio': [bin('prisma', 'studio', '--port', '5555', '--browser', 'none')],
    'permissions-audit': [
      bin('ts-node', '-P', 'tsconfig.scripts.json', 'scripts/audit-role-database.ts'),
    ],
    'permissions-contracts': [
      bin('ts-node', '-P', 'tsconfig.scripts.json', 'scripts/audit-permission-contracts.ts'),
    ],
    'permissions-seed': [script('prisma:seed-perms')],
    'seed-demo': [script('prisma:seed-development')],
    'storage-preview': [script('storage:migrate-private')],
    'storage-apply': [script('storage:migrate-private', ['--apply'])],
    'storage-prune': [script('storage:migrate-private', ['--apply', '--prune-public'])],
    'pastoral-preview': [script('pastoral:rotate-key')],
    'pastoral-apply': [script('pastoral:rotate-key', ['--apply'])],
    'backfill-emails': [script('backfill-profile-emails')],
    'docker-up': [['docker', 'compose', 'up', '-d']],
    'docker-down': [['docker', 'compose', 'down']],
  };
  if (item.id === 'verify')
    return [
      mapping.lint[0],
      mapping.test[0],
      mapping.build[0],
      ...(web ? mapping['audit-ui'] : mapping['permissions-contracts']),
    ];
  return mapping[item.id];
}
function validateLocal(item, ctx) {
  if (['db-reset', 'migration-dev', 'seed-demo'].includes(item.id))
    core.requireLocalDatabase(ctx.env);
  if (item.id === 'seed-demo') {
    const url = core.publicUrl(ctx.env.SUPABASE_URL);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new core.ConsoleError(
        'Demo seeding requires isolated local Supabase too; cloud demo accounts are not created by this console.',
      );
  }
}
function doctor(ctx) {
  const metadata = {
    environmentFile: ctx.file,
    fileExists: ctx.exists,
    precedence: 'Selected file overrides inherited values; dotenv is parsed, never executed.',
    node: process.versions.node,
    packageManager: manager,
  };
  if (ctx.exists) {
    const mode = fs.statSync(ctx.file).mode & 0o777;
    metadata.environmentPermissions = '0' + mode.toString(8);
    metadata.needsPrivateFilePermissions = (mode & 0o077) !== 0;
  }
  metadata.tools = Object.fromEntries(
    [manager, ...(web ? [] : ['pg_dump', 'pg_restore'])].map((tool) => {
      const binary =
        tool.startsWith('pg_') && ctx.env.OPS_PG_BIN_DIR
          ? path.join(ctx.env.OPS_PG_BIN_DIR, tool)
          : tool;
      const result = require('node:child_process').spawnSync(binary, ['--version'], {
        env: ctx.env,
        encoding: 'utf8',
        timeout: 5000,
      });
      return [
        tool,
        !result.error && result.status === 0 ? result.stdout.trim().split('\n')[0] : 'unavailable',
      ];
    }),
  );
  metadata.localDependenciesInstalled = fs.existsSync(path.join(root, 'node_modules'));
  if (!web) {
    try {
      const target = core.databaseTarget(ctx.env);
      metadata.database = target.label;
      metadata.targetId = target.id;
    } catch {
      metadata.database = 'not configured';
    }
    metadata.authConfigured = Boolean(ctx.env.SUPABASE_URL && ctx.env.SUPABASE_SERVICE_ROLE_KEY);
    metadata.redisConfigured = Boolean(ctx.env.REDIS_URL);
    metadata.workerMode =
      'Run worker as a persistent foreground service. Vercel API workers default off.';
  }
  for (const key of web
    ? [
        'API_URL',
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'INTERNAL_PROXY_SECRET',
      ]
    : ['TWO_FACTOR_ENCRYPTION_KEY', 'PASTORAL_ENCRYPTION_KEY', 'INTERNAL_PROXY_SECRET'])
    metadata[key] = ctx.env[key] ? 'configured' : 'missing';
  console.log(JSON.stringify(metadata, null, 2));
}
async function main() {
  if (mode === 'menu') {
    for (const item of actions.filter((item) => item.group === action))
      console.log(`${item.id}\t${item.label}`);
    return;
  }
  if (mode === 'list') {
    for (const item of actions) console.log(`${item.id}\t${item.label}`);
    return;
  }
  const item = definition(action);
  const ctx = context();
  core.managerCommands(manager);
  if (mode === 'token') {
    console.log(core.confirmation(action, ctx.env));
    return;
  }
  if (mode === 'input') {
    console.log(item.input || 'none');
    return;
  }
  if (mode === 'plan') {
    validateLocal(item, ctx);
    console.log(
      `DRY RUN: ${item.label}\nEnvironment: ${ctx.file}\nNo commands, network requests or mutations will run.`,
    );
    if (!web) {
      try {
        console.log(`Database: ${core.databaseTarget(ctx.env).label}`);
      } catch {
        console.log('Database: not configured');
      }
    }
    const steps = commands(item, ctx);
    if (steps)
      for (const step of steps) console.log(step.map((arg) => JSON.stringify(arg)).join(' '));
    if (item.input && !['port', 'url', 'name'].includes(item.input))
      console.log(
        'Requires typed target confirmation. Database clear/reset/restore take a verified public-schema backup first.',
      );
    return;
  }
  if (mode === 'backup-info') {
    if (web || action !== 'db-restore')
      throw new core.ConsoleError('Backup inspection is a backend restore action.');
    const backup = path.resolve(core.readFields()[0] || '');
    const metadata = await require('./backend.cjs').verifyBackup(backup);
    console.log(
      JSON.stringify(
        {
          backup,
          originalTarget: metadata.target,
          createdAt: metadata.createdAt,
          postgresqlMajor: metadata.postgresqlMajor,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (mode === 'preview') {
    validateLocal(item, ctx);
    if (web) return;
    const target = core.databaseTarget(ctx.env);
    console.log(`Environment: ${ctx.file}\nDatabase: ${target.label}\nTarget: ${target.id}`);
    if (ctx.env.SUPABASE_URL)
      console.log(`Auth project: ${core.publicUrl(ctx.env.SUPABASE_URL).origin}`);
    if (action === 'db-clear') {
      const backend = require('./backend.cjs');
      const db = backend.openDatabase(ctx.env);
      try {
        console.table(await backend.inventory(db));
      } finally {
        await db.$disconnect();
      }
      console.log(
        'Clears ALL application model tables, including roles and permissions. Migration history, Supabase Auth identities and storage are preserved. A verified public-schema backup is mandatory. Stop API/worker writers first.',
      );
    }
    if (action === 'db-reset')
      console.log(
        'Recreates the local development public schema, applies migrations, and leaves reference seeding as an explicit separate step. Stop writers first.',
      );
    if (action === 'db-restore')
      console.log(
        'Restores a trusted console public-schema backup in one transaction after backing up the current target. Stop writers first.',
      );
    return;
  }
  if (mode !== 'run') throw new core.ConsoleError('Unknown console operation.');
  validateLocal(item, ctx);
  if (action === 'env-init') return core.initEnvironment(ctx, '.env.example');
  if (action === 'doctor') return doctor(ctx);
  let fields = [];
  if (item.input && item.input !== 'none') fields = core.readFields();
  if (action === 'cache-clean') {
    if (fields[0] !== 'CLEAN .next') throw new core.ConsoleError('Cache clean cancelled.');
    fs.rmSync(path.join(root, '.next'), { recursive: true, force: true });
    console.log('Removed local .next build cache. Build again before production start.');
    return;
  }
  if (['confirm', 'admin', 'restore', 'name'].includes(item.input))
    core.assertConfirmation(action, ctx.env, fields[0]);
  if (
    ['port'].includes(item.input) &&
    (!/^\d+$/.test(fields[0] || '') || Number(fields[0]) < 1 || Number(fields[0]) > 65535)
  )
    throw new core.ConsoleError('Port must be between 1 and 65535.');
  if (item.input === 'name' && !/^[a-z][a-z0-9_-]{0,63}$/i.test(fields[1] || ''))
    throw new core.ConsoleError(
      'Migration name must start with a letter and use only letters, numbers, underscores or hyphens.',
    );
  if (action === 'health')
    return core.checkHealth(
      fields[0] || (web ? 'http://127.0.0.1:3000' : 'http://127.0.0.1:3001'),
      web,
    );
  const backend = web ? null : require('./backend.cjs');
  if (action === 'permissions-cache') {
    console.log(await backend.clearPermissionCache(ctx.env));
    return;
  }
  const dbActions = [
    'db-inventory',
    'db-backup',
    'db-clear',
    'db-reset',
    'db-restore',
    'admin-super',
    'admin-church',
    'church-list',
    'demo-retire',
  ];
  if (dbActions.includes(action)) {
    const db = backend.openDatabase(ctx.env);
    try {
      if (action === 'db-inventory') console.table(await backend.inventory(db));
      else if (action === 'db-backup') await backend.backupDatabase(ctx);
      else if (action === 'church-list')
        console.table(
          await db.church.findMany({
            where: { archived_at: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
        );
      else if (action.startsWith('admin-')) {
        const [
          ,
          email,
          password,
          firstName,
          lastName,
          phone,
          churchMode,
          churchId,
          churchName,
          authMode,
          authId,
        ] = fields;
        const input = {
          email,
          password,
          firstName,
          lastName,
          phone,
          churchMode,
          churchId,
          churchName,
          authMode,
          authId,
          role: action === 'admin-super' ? 'super_admin' : 'church_admin',
        };
        backend.validateAdmin(input);
        console.log(await backend.provisionAdmin(db, backend.openAuth(ctx.env), input));
        console.log(
          'Created a real login and branch-linked HQ profile. Configure authenticator security in the application. Password was not printed or saved.',
        );
      } else if (action === 'demo-retire')
        console.log(await backend.retireDemoUsers(db, backend.openAuth(ctx.env)));
      else {
        await backend.destructive(ctx, db, action, fields);
        console.log(
          'Database operation completed. Supabase Auth/storage were not cleared. Before restarting writers, invalidate permission caches, check migration status and seed reference permissions as appropriate.',
        );
      }
    } finally {
      await db.$disconnect();
    }
    return;
  }
  if (action === 'install') core.requireLock(root, manager);
  if (action === 'test-integration') {
    ctx.env.DATABASE_URL = ctx.env.TEST_DATABASE_URL || ctx.env.DATABASE_URL;
    core.requireLocalDatabase(ctx.env);
    if (!/test/i.test(new URL(ctx.env.DATABASE_URL).pathname))
      throw new core.ConsoleError('Integration tests need a database name containing test.');
  }
  if (
    [
      'migration-deploy',
      'migration-dev',
      'storage-apply',
      'storage-prune',
      'pastoral-apply',
    ].includes(action)
  )
    await backend.backupDatabase(ctx);
  const steps = commands(item, ctx, item.input === 'name' ? fields[1] : fields[0]);
  if (!steps) throw new core.ConsoleError('This action is handled by the Bash console.');
  for (const step of steps) {
    const lifecycle =
      ['build', 'start', 'worker'].includes(action) || step.includes('build')
        ? 'production'
        : action === 'dev'
          ? 'development'
          : ['test', 'console-test', 'test-integration', 'test-browser'].includes(action) ||
              step.includes('test')
            ? 'test'
            : ctx.env.NODE_ENV;
    core.child(step[0], step.slice(1), {
      ...ctx,
      env: { ...ctx.env, ...(lifecycle ? { NODE_ENV: lifecycle } : {}) },
    });
  }
  if (action === 'permissions-seed') {
    try {
      console.log(await backend.clearPermissionCache(ctx.env));
    } catch {
      throw new core.ConsoleError(
        'Permissions were seeded, but Redis invalidation failed. Run permissions-cache successfully before checking new grants.',
      );
    }
  }
}
if (require.main === module) {
  process.umask(0o077);
  main().catch((error) => {
    console.error(core.safeMessage(error));
    process.exitCode = error.exitCode || 1;
  });
}
module.exports = { main, commands, validateLocal, doctor };
