'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  ConsoleError,
  databaseTarget,
  requireLocalDatabase,
  publicUrl,
  assertConfirmation,
  child,
} = require('./core.cjs');

function openDatabase(env) {
  databaseTarget(env);
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
    }),
  });
}
function openAuth(env) {
  const url = publicUrl(env.SUPABASE_URL);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new ConsoleError(
      'Supabase admin operations require HTTPS, except for isolated loopback fixtures.',
    );
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ConsoleError(
      'SUPABASE_SERVICE_ROLE_KEY is required; no DB-only login accounts are created.',
    );
  return require('@supabase/supabase-js').createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).auth.admin;
}
function managedTables() {
  return require('@prisma/client')
    .Prisma.dmmf.datamodel.models.map((model) => model.dbName || model.name)
    .sort();
}
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
async function inventory(db) {
  const rows = [];
  for (const table of managedTables()) {
    const count = await db.$queryRawUnsafe(
      `SELECT count(*)::text AS count FROM public.${quote(table)}`,
    );
    rows.push({ table, rows: count[0].count });
  }
  return rows;
}
async function assertNoExternalReferences(db) {
  const references = await db.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM pg_constraint fk JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace WHERE fk.contype='f' AND pn.nspname='public' AND parent.relname=ANY($1::text[]) AND NOT (cn.nspname='public' AND child.relname=ANY($1::text[]))`,
    managedTables(),
  );
  if (references[0].count)
    throw new ConsoleError(
      'Unmanaged tables reference application tables. Refusing a cascading clear/reset; review those dependencies first.',
    );
}
async function assertNoExternalSchemaDependencies(db) {
  const rows = await db.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM pg_depend d CROSS JOIN LATERAL pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) parent CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) child LEFT JOIN pg_rewrite rewrite ON d.classid='pg_rewrite'::regclass AND rewrite.oid=d.objid LEFT JOIN pg_class view_relation ON view_relation.oid=rewrite.ev_class LEFT JOIN pg_namespace view_schema ON view_schema.oid=view_relation.relnamespace WHERE parent.schema='public' AND COALESCE(child.schema,view_schema.nspname) IS NOT NULL AND COALESCE(child.schema,view_schema.nspname)<>'public' AND COALESCE(child.schema,view_schema.nspname)<>'information_schema' AND COALESCE(child.schema,view_schema.nspname) NOT LIKE 'pg_%'`,
  );
  if (rows[0].count)
    throw new ConsoleError(
      'Objects outside public depend on this schema. Schema reset is refused to protect those objects.',
    );
}
async function clearDatabase(db) {
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");
      await assertNoExternalReferences(tx);
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${managedTables()
          .map((table) => 'public.' + quote(table))
          .join(', ')} RESTART IDENTITY RESTRICT`,
      );
    },
    { timeout: 60000 },
  );
}
function pgEnvironment(env) {
  const { url, host, name } = databaseTarget(env);
  const result = {
    ...env,
    PGHOST: host,
    PGPORT: url.port || '5432',
    PGDATABASE: name,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: '10',
  };
  for (const [param, variable] of [
    ['sslmode', 'PGSSLMODE'],
    ['sslrootcert', 'PGSSLROOTCERT'],
    ['sslcert', 'PGSSLCERT'],
    ['sslkey', 'PGSSLKEY'],
  ])
    if (url.searchParams.has(param)) result[variable] = url.searchParams.get(param);
  return result;
}
function pgCommand(command, args, context) {
  const binary = context.env.OPS_PG_BIN_DIR
    ? path.join(context.env.OPS_PG_BIN_DIR, command)
    : command;
  const result = spawnSync(binary, ['--no-password', ...args], {
    cwd: context.root,
    env: pgEnvironment(context.env),
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: false,
  });
  if (result.error || result.status !== 0)
    throw new ConsoleError(
      `${command} failed. Install compatible PostgreSQL client tools and check the selected connection. Provider output was suppressed to protect credentials.`,
    );
}
async function assertPgToolsMatch(context) {
  const db = openDatabase(context.env);
  let major;
  try {
    const rows = await db.$queryRawUnsafe('SHOW server_version_num');
    major = Math.floor(Number(rows[0].server_version_num) / 10000);
  } finally {
    await db.$disconnect();
  }
  for (const command of ['pg_dump', 'pg_restore']) {
    const binary = context.env.OPS_PG_BIN_DIR
      ? path.join(context.env.OPS_PG_BIN_DIR, command)
      : command;
    const result = spawnSync(binary, ['--version'], {
      env: context.env,
      encoding: 'utf8',
      shell: false,
    });
    const clientMajor = Number(result.stdout?.match(/(\d+)\./)?.[1]);
    if (result.error || result.status !== 0 || clientMajor !== major)
      throw new ConsoleError(
        `Use PostgreSQL ${major} pg_dump AND pg_restore tools for this server. Set OPS_PG_BIN_DIR to their directory. Backup/destructive action was refused.`,
      );
  }
  return major;
}
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function backupDatabase(context) {
  const target = databaseTarget(context.env);
  const postgresqlMajor = await assertPgToolsMatch(context);
  const directory = path.join(context.root, '.ops', 'backups');
  for (const folder of [path.join(context.root, '.ops'), directory]) {
    if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink())
      throw new ConsoleError('Private backup directories must not be symlinks.');
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    fs.chmodSync(folder, 0o700);
  }
  const file = path.join(
    directory,
    `churchos-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}.dump`,
  );
  const partial = file + '.partial';
  fs.closeSync(fs.openSync(partial, 'wx', 0o600));
  try {
    pgCommand(
      'pg_dump',
      ['--format=custom', '--schema=public', '--no-owner', '--no-acl', '--file', partial],
      context,
    );
    pgCommand('pg_restore', ['--list', partial], context);
    if (!fs.statSync(partial).size) throw new ConsoleError('Backup is empty; refusing to proceed.');
    fs.renameSync(partial, file);
    const metadata = {
      version: 1,
      schema: 'public',
      postgresqlMajor,
      target: target.label,
      targetId: target.id,
      sha256: await sha256(file),
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(file + '.json', JSON.stringify(metadata, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(`Verified public-schema backup: ${file}`);
    return file;
  } catch (error) {
    fs.rmSync(partial, { force: true });
    fs.rmSync(file, { force: true });
    throw error;
  }
}
async function verifyBackup(file) {
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(file + '.json', 'utf8'));
  } catch {
    throw new ConsoleError(
      'Restore needs a console-generated .dump file and its .dump.json metadata.',
    );
  }
  if (
    metadata.version !== 1 ||
    metadata.schema !== 'public' ||
    metadata.sha256 !== (await sha256(file))
  )
    throw new ConsoleError('Backup metadata/hash verification failed. Restore was refused.');
  return metadata;
}
function validateAdmin(input) {
  if (!['super_admin', 'church_admin'].includes(input.role))
    throw new ConsoleError('Only super_admin and church_admin can be provisioned here.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    throw new ConsoleError('Enter a valid email.');
  if (!input.firstName.trim() || !input.lastName.trim())
    throw new ConsoleError('First and last names are required.');
  if (
    !['new', 'existing'].includes(input.authMode) ||
    !['new', 'existing'].includes(input.churchMode)
  )
    throw new ConsoleError('Choose new or existing account/church mode.');
  if (
    input.authMode === 'new' &&
    !(
      input.password.length >= 12 &&
      /[a-z]/.test(input.password) &&
      /[A-Z]/.test(input.password) &&
      /\d/.test(input.password) &&
      /[^a-zA-Z0-9]/.test(input.password)
    )
  )
    throw new ConsoleError(
      'Use at least 12 password characters with uppercase, lowercase, number and symbol.',
    );
  const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
  if (input.authMode === 'existing' && !uuid.test(input.authId))
    throw new ConsoleError('Existing authentication user ID must be a UUID.');
  if (input.churchMode === 'existing' && !uuid.test(input.churchId))
    throw new ConsoleError('Existing church ID must be a UUID.');
  if (input.churchMode === 'new' && !input.churchName.trim())
    throw new ConsoleError('A new church needs a name.');
}
async function provisionAdmin(db, auth, input) {
  validateAdmin(input);
  const role = await db.role.findFirst({
    where: { name: input.role, church_id: null },
    include: { _count: { select: { permissions: true } } },
  });
  if (!role?._count.permissions)
    throw new ConsoleError('Seed the reference permissions before creating an administrator.');
  if (
    await db.profile.findFirst({ where: { email: { equals: input.email, mode: 'insensitive' } } })
  )
    throw new ConsoleError(
      'A profile already uses this email. Existing roles are never changed by this action.',
    );
  if (
    input.churchMode === 'existing' &&
    !(await db.church.findFirst({
      where: { id: input.churchId, archived_at: null },
      select: { id: true },
    }))
  )
    throw new ConsoleError('The selected active church does not exist.');
  let userId;
  let createdAuth = false;
  if (input.authMode === 'existing') {
    const result = await auth.getUserById(input.authId);
    if (
      result.error ||
      !result.data?.user ||
      result.data.user.email?.toLowerCase() !== input.email.toLowerCase()
    )
      throw new ConsoleError('Existing auth ID and email do not match. No account was changed.');
    userId = result.data.user.id;
    if (await db.profile.findUnique({ where: { user_id: userId } }))
      throw new ConsoleError(
        'This auth user already has an application profile; automatic role promotion is refused.',
      );
  } else {
    const result = await auth.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { first_name: input.firstName, last_name: input.lastName },
    });
    if (result.error || !result.data?.user)
      throw new ConsoleError(
        'Authentication account creation failed. Existing logins are never adopted or reset automatically. To link an orphan account, choose existing auth ID explicitly.',
      );
    userId = result.data.user.id;
    createdAuth = true;
  }
  try {
    return await db.$transaction(
      async (tx) => {
        const church =
          input.churchMode === 'new'
            ? await tx.church.create({ data: { name: input.churchName, email: input.email } })
            : await tx.church.findFirst({ where: { id: input.churchId, archived_at: null } });
        if (!church) throw new ConsoleError('The selected church is no longer active.');
        const branch =
          (await tx.branch.findFirst({
            where: { church_id: church.id, is_headquarters: true, archived_at: null },
          })) ||
          (await tx.branch.create({
            data: { church_id: church.id, name: 'Headquarters', is_headquarters: true },
          }));
        const profile = await tx.profile.create({
          data: {
            user_id: userId,
            church_id: church.id,
            branch_id: branch.id,
            role: [input.role],
            is_admin_hq: true,
            first_name: input.firstName,
            last_name: input.lastName,
            email: input.email,
            phone: input.phone || null,
          },
        });
        await tx.auditLog.create({
          data: {
            church_id: church.id,
            user_id: userId,
            entity: 'profile',
            entity_id: profile.id,
            action: 'CREATE',
            user_agent: 'ChurchOS operations console',
            new_values: { role: [input.role], is_admin_hq: true, provisioning: input.authMode },
          },
        });
        return {
          profileId: profile.id,
          churchId: church.id,
          branchId: branch.id,
          role: input.role,
        };
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  } catch (error) {
    if (createdAuth) {
      const cleanup = await auth.deleteUser(userId).catch(() => ({ error: true }));
      if (cleanup.error)
        throw new ConsoleError(
          `Database provisioning failed and auth cleanup failed. Review orphan authentication user ${userId} before retrying; no password was logged.`,
        );
      throw new ConsoleError(
        'Database provisioning failed; the newly created auth account was removed. Existing accounts were untouched.',
      );
    }
    throw error;
  }
}
async function listDemoUsers(auth) {
  const users = [];
  for (let page = 1; ; page++) {
    const result = await auth.listUsers({ page, perPage: 1000 });
    if (result.error || !Array.isArray(result.data?.users))
      throw new ConsoleError('Could not inventory authentication users.');
    users.push(
      ...result.data.users.filter((user) => user.email?.toLowerCase().endsWith('@churchos.dev')),
    );
    if (result.data.users.length < 1000) return users;
  }
}
async function retireDemoUsers(db, auth) {
  const users = await listDemoUsers(auth);
  const ids = users.map((user) => user.id);
  await db.$transaction(async (tx) => {
    await tx.profile.updateMany({ where: { user_id: { in: ids } }, data: { status: 'inactive' } });
    await tx.verifiedMfaSession.deleteMany({ where: { user_id: { in: ids } } });
  });
  let banned = 0;
  for (const user of users) {
    const result = await auth.updateUserById(user.id, { ban_duration: '876000h' });
    if (result.error)
      throw new ConsoleError(
        `Demo profiles/approvals were disabled, but auth retirement is incomplete (${banned}/${users.length} banned). Retry this idempotent action after checking Supabase connectivity.`,
      );
    banned++;
  }
  return { disabledDemoAccounts: banned, deletedBusinessRecords: 0 };
}
async function clearPermissionCache(env, injected) {
  if (!env.REDIS_URL) throw new ConsoleError('REDIS_URL is required to invalidate permissions.');
  const rest = env.REDIS_URL.startsWith('https://');
  let client = injected;
  if (!client) {
    if (rest) {
      if (!env.UPSTASH_REDIS_TOKEN)
        throw new ConsoleError('UPSTASH_REDIS_TOKEN is required for REST Redis.');
      client = new (require('@upstash/redis').Redis)({
        url: env.REDIS_URL,
        token: env.UPSTASH_REDIS_TOKEN,
        retry: { retries: 0 },
        signal: () => AbortSignal.timeout(5000),
      });
    } else {
      client = new (require('ioredis'))(env.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        commandTimeout: 5000,
      });
      client.on('error', () => {});
      try {
        await client.connect();
      } catch {
        client.disconnect();
        throw new ConsoleError('Could not connect to Redis for permissions invalidation.');
      }
    }
  }
  let cursor = '0',
    deleted = 0,
    iterations = 0;
  try {
    do {
      if (++iterations > 10000)
        throw new ConsoleError('Permissions scan reached its safety limit; repeat to continue.');
      const page = rest
        ? await client.scan(Number(cursor), { match: 'perms:*', count: 100 })
        : await client.scan(cursor, 'MATCH', 'perms:*', 'COUNT', 100);
      cursor = String(page[0]);
      const keys = page[1].filter((key) => key.startsWith('perms:'));
      if (keys.length) deleted += await client.del(...keys);
    } while (cursor !== '0');
    return { deletedPermissionKeys: deleted };
  } finally {
    if (!rest && !injected) client.disconnect();
  }
}
async function destructive(context, db, action, fields) {
  assertConfirmation(action, context.env, fields[0]);
  if (action === 'db-reset') requireLocalDatabase(context.env);
  if (action === 'db-restore') await verifyBackup(path.resolve(fields[1] || ''));
  await assertNoExternalReferences(db);
  if (action === 'db-reset') await assertNoExternalSchemaDependencies(db);
  await backupDatabase(context); // A failed backup always prevents the destructive step.
  if (action === 'db-clear') await clearDatabase(db);
  else if (action === 'db-reset')
    child(
      path.join(context.root, 'node_modules/.bin/prisma'),
      ['migrate', 'reset', '--force'],
      context,
    );
  else if (action === 'db-restore')
    pgCommand(
      'pg_restore',
      [
        '--dbname',
        databaseTarget(context.env).name,
        '--clean',
        '--if-exists',
        '--single-transaction',
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '--schema=public',
        path.resolve(fields[1]),
      ],
      context,
    );
  else throw new ConsoleError('Unknown destructive action.');
}
module.exports = {
  openDatabase,
  openAuth,
  managedTables,
  inventory,
  clearDatabase,
  assertNoExternalReferences,
  assertNoExternalSchemaDependencies,
  pgEnvironment,
  backupDatabase,
  verifyBackup,
  validateAdmin,
  provisionAdmin,
  listDemoUsers,
  retireDemoUsers,
  clearPermissionCache,
  destructive,
};
