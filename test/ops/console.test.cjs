'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const core = require('../../scripts/ops/core.cjs');
const actions = require('../../scripts/ops/actions.cjs');
const web = require('../../package.json').name === 'churchos-web';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'churchos-ops-test-'));
const environment = path.join(directory, 'selected env');
const local = {
  DATABASE_URL: 'postgresql://operator:p%40ss@127.0.0.1:55439/churchos_console_test',
  SUPABASE_URL: 'http://127.0.0.1:54321',
};
fs.writeFileSync(
  environment,
  Object.entries(local)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n'),
  { mode: 0o600 },
);
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
function cleanEnvironment(extra = {}) {
  const result = { ...process.env, ...extra };
  delete result.NODE_TEST_CONTEXT;
  return result;
}
function consoleRun(args, input = '', env = {}) {
  return spawnSync('bash', [path.join(root, 'scripts/console.sh'), '--env', environment, ...args], {
    cwd: directory,
    input,
    encoding: 'utf8',
    env: cleanEnvironment(env),
    timeout: 15000,
  });
}
test('help, action inventory and EOF exit work from another directory', () => {
  assert.equal(consoleRun(['--help']).status, 0);
  const list = consoleRun(['--list']);
  assert.equal(list.status, 0);
  for (const action of actions) assert.ok(list.stdout.includes(action.id));
  assert.equal(consoleRun([]).status, 0);
});
test('every action produces a no-execution dry-run plan', () => {
  for (const action of actions) {
    const result = consoleRun(['--dry-run', '--action', action.id]);
    assert.equal(result.status, 0, `${action.id}: ${result.stderr}`);
    assert.match(result.stdout, /DRY RUN/);
  }
});
test('invalid arguments and unknown actions fail closed', () => {
  for (const args of [
    ['--action'],
    ['--manager', 'bad'],
    ['--arbitrary'],
    ['--action', 'sh -c whoami'],
  ])
    assert.notEqual(consoleRun(args).status, 0);
});
test('dotenv is data, selected file wins, diagnostics do not expose credentials', () => {
  const file = path.join(directory, 'untrusted.env');
  const marker = path.join(directory, 'must-not-exist');
  fs.writeFileSync(
    file,
    `DATABASE_URL=${local.DATABASE_URL}\nMARKER=$(touch ${marker})\nINTERNAL_PROXY_SECRET=very-secret-value\n`,
  );
  const ctx = core.loadEnvironment(root, file, { DATABASE_URL: 'postgresql://remote/production' });
  assert.equal(ctx.env.DATABASE_URL, local.DATABASE_URL);
  assert.equal(ctx.env.MARKER, `$(touch ${marker})`);
  assert.equal(fs.existsSync(marker), false);
  const result = spawnSync(
    'node',
    [path.join(root, 'scripts/ops/cli.cjs'), file, 'npm', 'run', 'doctor'],
    { encoding: 'utf8', env: cleanEnvironment() },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes('very-secret-value'), false);
  assert.equal(result.stdout.includes('p%40ss'), false);
});
test('environment initialization refuses overwrite and creates mode 0600', () => {
  const file = path.join(directory, 'new.env');
  core.initEnvironment({ root, file }, '.env.example');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const content = fs.readFileSync(file, 'utf8');
  assert.throws(() => core.initEnvironment({ root, file }, '.env.example'), /not overwritten/);
  assert.equal(fs.readFileSync(file, 'utf8'), content);
});
test('database identity excludes credentials and confirmation is target specific', () => {
  const target = core.databaseTarget(local);
  assert.equal(target.label.includes('p%40ss'), false);
  assert.throws(() => core.assertConfirmation('db-clear', local, 'yes'), /Nothing was changed/);
  core.assertConfirmation('db-clear', local, core.confirmation('db-clear', local));
  assert.throws(() =>
    core.assertConfirmation(
      'db-clear',
      { DATABASE_URL: 'postgresql://host/other' },
      core.confirmation('db-clear', local),
    ),
  );
  assert.throws(() =>
    core.requireLocalDatabase({ DATABASE_URL: 'postgresql://remote/churchos_test' }),
  );
  assert.throws(() =>
    core.requireLocalDatabase({ DATABASE_URL: 'postgresql://localhost/production' }),
  );
  assert.throws(() => core.databaseTarget({ DATABASE_URL: local.DATABASE_URL + '?schema=auth' }));
});
test('install failure is returned and interactive menu stays available', () => {
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, 'npm'),
    '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$OPS_COMMAND_LOG"\nexit 27\n',
    { mode: 0o700 },
  );
  const log = path.join(directory, 'commands');
  const env = { PATH: bin + path.delimiter + process.env.PATH, OPS_COMMAND_LOG: log };
  const single = consoleRun(['--action', 'install'], '', env);
  assert.equal(single.status, 27);
  assert.match(fs.readFileSync(log, 'utf8'), /^ci\n--include=dev/);
  const interactive = consoleRun([], '1\n3\n0\n0\n', env);
  assert.equal(interactive.status, 0);
  assert.match(interactive.stdout + interactive.stderr, /menu remains available/);
});
test('mutations cancel on EOF/mismatched confirmation before executing', () => {
  const action = web ? 'cache-clean' : 'permissions-cache';
  assert.equal(consoleRun(['--action', action], 'wrong\n').status, 130);
  assert.equal(consoleRun(['--action', action], '').status, 130);
});
test('health handles API prefixes, full health URLs, unhealthy data and timeouts', async () => {
  const server = require('node:http').createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/health') res.end(JSON.stringify({ status: 'healthy' }));
    else if (req.url === '/bad/api/v1/health') res.end(JSON.stringify({ status: 'degraded' }));
    else if (req.url === '/wait/api/v1/health') return;
    else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await core.checkHealth(base + '/api/v1/');
    await core.checkHealth(base + '/api/v1/health');
    await assert.rejects(core.checkHealth(base + '/bad'), /not confirmed healthy/);
    await assert.rejects(core.checkHealth(base + '/wait', false, 50), /exceeded/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
if (!web)
  test('remote schema reset/demo seeds are rejected even during planning', () => {
    const file = path.join(directory, 'remote.env');
    fs.writeFileSync(
      file,
      'DATABASE_URL=postgresql://remote.example/churchos_test\nSUPABASE_URL=https://auth.example',
    );
    for (const action of ['db-reset', 'seed-demo', 'migration-dev']) {
      const result = spawnSync(
        'bash',
        [path.join(root, 'scripts/console.sh'), '--env', file, '--dry-run', '--action', action],
        { env: cleanEnvironment(), encoding: 'utf8' },
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /local database/);
    }
  });
if (web)
  test('cache cleanup removes only the local build path, without following symlinks', () => {
    const clone = path.join(directory, 'frontend-copy');
    fs.mkdirSync(path.join(clone, 'scripts/ops'), { recursive: true });
    fs.writeFileSync(path.join(clone, 'package.json'), JSON.stringify({ name: 'churchos-web' }));
    fs.copyFileSync(path.join(root, 'scripts/console.sh'), path.join(clone, 'scripts/console.sh'));
    for (const file of ['core.cjs', 'cli.cjs', 'actions.cjs'])
      fs.copyFileSync(path.join(root, 'scripts/ops', file), path.join(clone, 'scripts/ops', file));
    const outside = path.join(directory, 'outside-cache');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep'), 'preserve');
    fs.symlinkSync(outside, path.join(clone, '.next'), 'dir');
    const result = spawnSync(
      'bash',
      [path.join(clone, 'scripts/console.sh'), '--action', 'cache-clean'],
      { input: 'CLEAN .next\n', env: cleanEnvironment(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(clone, '.next')), false);
    assert.equal(fs.readFileSync(path.join(outside, 'keep'), 'utf8'), 'preserve');
  });
test('foreground Ctrl-C propagates and exits the single action', { timeout: 8000 }, async () => {
  const bin = path.join(directory, 'signal-bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'npm'),
    '#!/usr/bin/env bash\nexec node -e "console.log(\'OPS_RUNNING\');setInterval(()=>{},1000)"\n',
    { mode: 0o700 },
  );
  const child = spawn(
    'bash',
    [path.join(root, 'scripts/console.sh'), '--env', environment, '--action', 'dev'],
    { detached: true, env: cleanEnvironment({ PATH: bin + path.delimiter + process.env.PATH }) },
  );
  let signalled = false;
  const done = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  );
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }, 6000);
  try {
    child.stdout.on('data', (chunk) => {
      if (!signalled && chunk.toString().includes('OPS_RUNNING')) {
        signalled = true;
        process.kill(-child.pid, 'SIGINT');
      }
    });
    child.stdin.end(web ? '3000\n' : '');
    const result = await done;
    assert.equal(signalled, true);
    assert.ok(result.code === 130 || result.signal === 'SIGINT', JSON.stringify(result));
  } finally {
    clearTimeout(timer);
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }
});
if (!web) {
  const backend = require('../../scripts/ops/backend.cjs');
  test('password input is never echoed or passed in command arguments', () => {
    const password = 'ConsoleOnlySecret#123';
    const token = core.confirmation('admin-super', local);
    const result = consoleRun(
      ['--action', 'admin-super'],
      `1\nadmin@example.test\n${password}\n${password}\nFirst\nLast\n\n2\nTest Church\n${token}\n`,
      { SUPABASE_SERVICE_ROLE_KEY: '' },
    );
    assert.notEqual(result.status, 0);
    assert.equal((result.stdout + result.stderr).includes(password), false);
    assert.match(result.stderr, /SUPABASE_SERVICE_ROLE_KEY/);
    const traced = spawnSync(
      'bash',
      [
        '-x',
        path.join(root, 'scripts/console.sh'),
        '--env',
        environment,
        '--action',
        'admin-super',
      ],
      {
        cwd: directory,
        input: `1\nadmin@example.test\n${password}\n${password}\nFirst\nLast\n\n2\nTest Church\n${token}\n`,
        encoding: 'utf8',
        env: cleanEnvironment({ SUPABASE_SERVICE_ROLE_KEY: '' }),
      },
    );
    assert.equal((traced.stdout + traced.stderr).includes(password), false);
  });
  const input = {
    role: 'church_admin',
    email: 'new@example.test',
    password: 'StrongOperator#123',
    firstName: 'First',
    lastName: 'Last',
    phone: '',
    churchMode: 'new',
    churchId: '',
    churchName: 'New Church',
    authMode: 'new',
    authId: '',
  };
  function fakeServices(fail = false) {
    const calls = [];
    const tx = {
      church: { create: async () => ({ id: 'church-a' }) },
      branch: {
        findFirst: async () => null,
        create: async (arg) => {
          calls.push(['branch', arg]);
          return { id: 'branch-a' };
        },
      },
      profile: {
        create: async (arg) => {
          calls.push(['profile', arg]);
          if (fail) throw new Error('sensitive-provider-message');
          return { id: 'profile-a' };
        },
      },
      auditLog: {
        create: async (arg) => {
          calls.push(['audit', arg]);
          return {};
        },
      },
    };
    const db = {
      role: { findFirst: async () => ({ _count: { permissions: 10 } }) },
      profile: { findFirst: async () => null, findUnique: async () => null },
      $transaction: async (fn) => fn(tx),
    };
    const auth = {
      createUser: async () => {
        calls.push(['auth-create']);
        return { data: { user: { id: 'auth-a' } } };
      },
      deleteUser: async (id) => {
        calls.push(['auth-delete', id]);
        return {};
      },
    };
    return { db, auth, calls };
  }
  test('admin creation uses exact selected role, branch/HQ scope and secret-free audit', async () => {
    for (const role of ['super_admin', 'church_admin']) {
      const { db, auth, calls } = fakeServices();
      const result = await backend.provisionAdmin(db, auth, { ...input, role });
      assert.equal(result.role, role);
      const data = calls.find((c) => c[0] === 'profile')[1].data;
      assert.deepEqual(data.role, [role]);
      assert.equal(data.branch_id, 'branch-a');
      assert.equal(data.is_admin_hq, true);
      assert.equal(JSON.stringify(calls).includes(input.password), false);
    }
  });
  test('failed profile transaction compensates only newly created auth identity', async () => {
    const { db, auth, calls } = fakeServices(true);
    await assert.rejects(
      backend.provisionAdmin(db, auth, input),
      /newly created auth account was removed/,
    );
    assert.deepEqual(calls.at(-1), ['auth-delete', 'auth-a']);
  });
  test('existing auth/profile cannot be silently promoted or have credentials reset', async () => {
    const { db, auth, calls } = fakeServices();
    db.profile.findFirst = async () => ({ id: 'already-profiled' });
    await assert.rejects(
      backend.provisionAdmin(db, auth, input),
      /Existing roles are never changed/,
    );
    assert.equal(calls.length, 0);
    const second = fakeServices();
    second.auth.getUserById = async () => ({
      data: { user: { id: '00000000-0000-4000-8000-000000000001', email: input.email } },
    });
    second.db.profile.findUnique = async () => ({ id: 'existing-profile' });
    await assert.rejects(
      backend.provisionAdmin(second.db, second.auth, {
        ...input,
        authMode: 'existing',
        authId: '00000000-0000-4000-8000-000000000001',
      }),
      /automatic role promotion is refused/,
    );
    assert.equal(second.calls.length, 0);
  });
  test('existing auth identity is retained if orphan-link database provisioning fails', async () => {
    const { db, auth, calls } = fakeServices(true);
    auth.getUserById = async () => ({
      data: { user: { id: '00000000-0000-4000-8000-000000000001', email: input.email } },
    });
    await assert.rejects(
      backend.provisionAdmin(db, auth, {
        ...input,
        authMode: 'existing',
        authId: '00000000-0000-4000-8000-000000000001',
      }),
    );
    assert.equal(
      calls.some((c) => c[0] === 'auth-delete' || c[0] === 'auth-create'),
      false,
    );
  });
  test('permission invalidation removes only perms keys across cursor pages', async () => {
    const deleted = [];
    let page = 0;
    const client = {
      scan: async () =>
        ++page === 1 ? ['3', ['perms:v20:one', 'unrelated:key']] : ['0', ['perms:v19:two']],
      del: async (...keys) => {
        deleted.push(...keys);
        return keys.length;
      },
    };
    const result = await backend.clearPermissionCache({ REDIS_URL: 'redis://localhost' }, client);
    assert.equal(result.deletedPermissionKeys, 2);
    assert.deepEqual(deleted, ['perms:v20:one', 'perms:v19:two']);
  });
  test('backup corruption and incorrect confirmation prevent destructive execution', async () => {
    const file = path.join(directory, 'corrupt.dump');
    fs.writeFileSync(file, 'not-a-backup');
    fs.writeFileSync(
      file + '.json',
      JSON.stringify({ version: 1, schema: 'public', sha256: 'bad' }),
    );
    await assert.rejects(backend.verifyBackup(file), /verification failed/);
    await assert.rejects(
      backend.destructive({ env: local }, {}, 'db-clear', ['wrong']),
      /Nothing was changed/,
    );
  });
}
