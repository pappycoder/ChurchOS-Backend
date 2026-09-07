/**
 * @file seed-demo-logins.ts
 * @description Provisions `profiles` rows keyed to the REAL Supabase demo auth
 * accounts, so local demo logins resolve in `GET /profiles/me` (and the whole
 * app) instead of 404ing "User profile not found".
 *
 * Background: the plain `prisma:seed`/`prisma:seed-full` scripts write profiles
 * with `user_id: crypto.randomUUID()` — ids that never match a real Supabase
 * user sub. Those rows are useful for pickers/UI, but no demo login can ever
 * authenticate to them. This script resolves each demo account's auth sub by
 * email (via the Supabase admin API) and upserts the matching profile row.
 *
 * Idempotent: re-running updates profiles that already exist and creates the
 * missing ones. It never touches members/transactions/forms demo data.
 *
 * Usage:
 *   npm run prisma:seed-demo-logins
 *
 * @module seed-demo-logins
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Dev database ids for the RCCG demo church/branch that host the seeded
// "Sunday Worship Service" event (see prisma/seed-full.ts).
const CHURCH_RCCG = 'd922c528-f4cd-4347-a7ef-bd8d4d10c7a6';
const BRANCH_RCCG = 'c7171ba1-6d4f-4d16-b1a4-d72e12e975f2';

interface DemoAccount {
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  churchId: string;
  branchId: string;
  isAdminHq: boolean;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'admin@churchos.dev',
    firstName: 'Church',
    lastName: 'Admin',
    roles: ['church_admin'],
    churchId: CHURCH_RCCG,
    branchId: BRANCH_RCCG,
    isAdminHq: true,
  },
  {
    email: 'cell.leader@churchos.dev',
    firstName: 'Cell',
    lastName: 'Leader',
    roles: ['cell_leader'],
    churchId: CHURCH_RCCG,
    branchId: BRANCH_RCCG,
    isAdminHq: false,
  },
  {
    email: 'cell.leader.hq@churchos.dev',
    firstName: 'Cell',
    lastName: 'Leader HQ',
    roles: ['cell_leader'],
    churchId: CHURCH_RCCG,
    branchId: BRANCH_RCCG,
    isAdminHq: true,
  },
];

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
});
const prisma = new PrismaClient({ adapter });

async function resolveSubsByEmail(supabase: SupabaseClient): Promise<Map<string, string>> {
  const subs = new Map<string, string>();
  // Demo projects have a handful of users; page through to be safe.
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) subs.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length === 0 || data.users.length < 200) break;
  }
  return subs;
}

async function main(): Promise<void> {
  console.log('🌱 Starting demo-login provisioning...\n');

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env to resolve demo auth users.',
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const subs = await resolveSubsByEmail(supabase);
  console.log(`  ✅ Resolved ${subs.size} demo auth users from Supabase\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const account of DEMO_ACCOUNTS) {
    const sub = subs.get(account.email.toLowerCase());
    if (!sub) {
      console.warn(`  ⚠️  No Supabase auth user found for ${account.email} — skipped`);
      skipped++;
      continue;
    }

    const data = {
      user_id: sub,
      church_id: account.churchId,
      branch_id: account.branchId,
      role: account.roles,
      first_name: account.firstName,
      last_name: account.lastName,
      email: account.email,
      is_admin_hq: account.isAdminHq,
    };

    const existing = await prisma.profile.findUnique({ where: { user_id: sub } });
    if (existing) {
      await prisma.profile.update({
        where: { user_id: sub },
        data,
      });
      console.log(`  ✅ Updated ${account.email} → ${account.roles.join(', ')} (${sub})`);
      updated++;
    } else {
      await prisma.profile.create({ data });
      console.log(`  ✅ Created ${account.email} → ${account.roles.join(', ')} (${sub})`);
      created++;
    }
  }

  console.log(
    `\n🎉 Demo-login provisioning complete: ${created} created, ${updated} updated, ${skipped} skipped.`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
