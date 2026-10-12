/** Provision just the two usher demo accounts without reseeding other data. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import { seedUsers } from './seeds/development/users.seed';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
});

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('Supabase admin credentials are required to seed login accounts');
  const hq = await prisma.profile.findFirst({ where: { email: 'treasurer.hq@churchos.dev' } });
  const branch = await prisma.profile.findFirst({
    where: { email: 'branch.treasurer@churchos.dev' },
  });
  if (!hq?.branch_id || !branch?.branch_id || hq.church_id !== branch.church_id)
    throw new Error('Seed the development church and treasurer accounts first');
  await seedUsers(
    prisma,
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    hq.church_id,
    hq.branch_id,
    branch.branch_id,
    [],
    ['usher', 'branch_usher'],
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
