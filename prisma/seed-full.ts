/**
 * @file seed-full.ts
 * @description FULL ChurchOS development seed — factory-reset test environment.
 *
 * Creates real Supabase Auth users (shared dev password: ChurchOS@1234),
 * profiles for every role in both HQ and a non-HQ branch, plus reference data
 * (members, families, visitors, giving, events, attendance, org, pastoral,
 * communication, media, appointments, system rows) across all 60 models.
 *
 * Idempotent — safe to rerun (no duplicate rows or auth users).
 *
 * Usage:
 *   npm run db:seed
 *   npx prisma db seed   (wired via package.json "prisma.seed")
 */

import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { seedChurch } from './seeds/church.seed';
import { seedCategories } from './seeds/categories.seed';
import { seedPermissions } from './seeds/permissions.seed';
import { seedServices } from './seeds/services.seed';
import { seedFormTemplates } from './seeds/form-templates.seed';
import { seedMembers } from './seeds/members.seed';

import { seedBranches } from './seeds/full/branches.seed';

import { seedUsers, UserSeedResult } from './seeds/full/users.seed';

import { seedPeople, assignVisitorFollowUp, PersonSeedResult } from './seeds/full/people.seed';

import { seedGiving } from './seeds/full/giving.seed';
import { seedEvents } from './seeds/full/events.seed';
import { seedAttendance } from './seeds/full/attendance.seed';
import { seedOrg } from './seeds/full/org.seed';
import { seedPastoral } from './seeds/full/pastoral.seed';
import { seedMedia } from './seeds/full/media.seed';
import { seedComm } from './seeds/full/comm.seed';
import { seedAppointments } from './seeds/full/appointments.seed';
import { seedSystem } from './seeds/full/system.seed';

// -----------------------------------------------------------------------------
// Prisma
// -----------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined in the environment.');
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  adapter,
});

// -----------------------------------------------------------------------------
// Supabase
// -----------------------------------------------------------------------------

let supabase: SupabaseClient | null = null;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// -----------------------------------------------------------------------------
// Main seed
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🌱 Starting FULL database seed...\n');

  // ---------------------------------------------------------------------------
  // 1. Church + categories + permissions + services + form templates
  // ---------------------------------------------------------------------------

  const { churchId, branchId: hqBranchId, churchName } = await seedChurch(prisma);

  await seedCategories(prisma, churchId);

  await seedPermissions(prisma);

  const { serviceCount } = await seedServices(prisma, churchId, hqBranchId);

  await seedFormTemplates(prisma, churchId);

  // ---------------------------------------------------------------------------
  // 2. Lekki branch (non-HQ)
  // ---------------------------------------------------------------------------

  const { lekkiBranchId } = await seedBranches(prisma, churchId, hqBranchId);

  // ---------------------------------------------------------------------------
  // 3. Base members + extra people, families and visitors
  // ---------------------------------------------------------------------------

  const base = await seedMembers(prisma, churchId, hqBranchId);

  const baseMembersForPeople = base.members.map((member) => ({
    ...member,
    phone: 'phone' in member && typeof member.phone === 'string' ? member.phone : null,
  }));

  const people: PersonSeedResult = await seedPeople(
    prisma,
    churchId,
    hqBranchId,
    lekkiBranchId,
    baseMembersForPeople,
  );

  const members = people.members;
  const visitors = people.visitors;

  // ---------------------------------------------------------------------------
  // 4. Real Supabase Auth users + profiles
  // ---------------------------------------------------------------------------

  const users: UserSeedResult = await seedUsers(
    prisma,
    supabase,
    churchId,
    hqBranchId,
    lekkiBranchId,
    members,
  );

  const profilesByKey = users.profilesByKey;

  await assignVisitorFollowUp(prisma, visitors, profilesByKey);

  // ---------------------------------------------------------------------------
  // 5. Events + tiers + registrations + tickets
  // ---------------------------------------------------------------------------

  const eventsSeed = await seedEvents(prisma, churchId, hqBranchId, lekkiBranchId, members);

  const fetchedEvents = await prisma.event.findMany({
    where: {
      church_id: churchId,
    },
    select: {
      id: true,
    },
  });

  // ---------------------------------------------------------------------------
  // 6. Giving transactions + recurring giving
  // ---------------------------------------------------------------------------

  await seedGiving(prisma, churchId, hqBranchId, lekkiBranchId, members);

  // ---------------------------------------------------------------------------
  // 7. Attendance
  // ---------------------------------------------------------------------------

  const services = await prisma.service.findMany({
    where: {
      church_id: churchId,
    },
    select: {
      id: true,
    },
  });

  await seedAttendance(prisma, churchId, members, services, fetchedEvents, visitors);

  // ---------------------------------------------------------------------------
  // 8. Organization
  //    Departments, cell groups, assets, etc.
  // ---------------------------------------------------------------------------

  await seedOrg(prisma, churchId, hqBranchId, lekkiBranchId, members);

  // ---------------------------------------------------------------------------
  // 9. Pastoral care data
  // ---------------------------------------------------------------------------

  await seedPastoral(prisma, churchId, members);

  // ---------------------------------------------------------------------------
  // 10. Communication
  //     Forms, messages, emails, notifications, custom fields
  // ---------------------------------------------------------------------------

  await seedComm(prisma, churchId, hqBranchId, lekkiBranchId, members, profilesByKey);

  // ---------------------------------------------------------------------------
  // 11. Media
  //     Sermons, media assets, etc.
  // ---------------------------------------------------------------------------

  await seedMedia(prisma, churchId, members);

  // ---------------------------------------------------------------------------
  // 12. Appointments
  // ---------------------------------------------------------------------------

  await seedAppointments(prisma, churchId, hqBranchId, profilesByKey, visitors);

  // ---------------------------------------------------------------------------
  // 13. System rows
  //     Church configs, audit logs, webhooks, sync devices/queue
  // ---------------------------------------------------------------------------

  await seedSystem(prisma, churchId);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log('\n🎉 FULL seed completed successfully!\n');

  console.log('Summary:');

  console.log(`  • Church: ${churchName} (HQ + Lekki Campus)`);

  console.log(`  • Members: ${members.length}`);

  console.log(`  • Visitors: ${visitors.length}`);

  console.log(
    `  • Auth users: ${users.authUsersCreated} created, ${users.authUsersExisting} existing`,
  );

  console.log(`  • Profiles: ${Object.keys(profilesByKey).length}`);

  console.log(`  • Events: ${eventsSeed.eventCount}, transactions: (see giving.seed output)`);

  console.log(`  • Services: ${serviceCount}`);

  console.log(`  • Dev password (all auth users): ChurchOS@1234`);

  console.log('\n📌 Sign-in emails — HQ: superadmin@churchos.dev, admin@churchos.dev,');

  console.log(
    '    senior.pastor@churchos.dev, treasurer.hq@churchos.dev, secretary.hq@churchos.dev,',
  );

  console.log('    dept.head.hq@churchos.dev, member.hq@churchos.dev');

  console.log('  Lekki: branch.pastor@churchos.dev, branch.secretary@churchos.dev,');

  console.log(
    '    branch.treasurer@churchos.dev, branch.depthead@churchos.dev, cell.leader@churchos.dev,',
  );

  console.log('    member.lekki@churchos.dev (plus 5 bulk member accounts)');
}

// -----------------------------------------------------------------------------
// Execute
// -----------------------------------------------------------------------------

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
