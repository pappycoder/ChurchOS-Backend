/**
 * @file index.seed.ts
 * @description DEVELOPMENT seed orchestration — factory-reset test environment.
 *
 * Populates the database entirely with linked demo data across all 60 models:
 * real Supabase Auth users (shared dev password: ChurchOS@1234), profiles for
 * every role in both HQ and a non-HQ branch, plus reference data (members,
 * families, visitors, giving, events, attendance, org, pastoral, communication,
 * media, appointments, system rows). This is the "Development" path of the main
 * `prisma/seed.ts` entry and replaces the former `seed-full.ts`.
 *
 * Idempotent — safe to rerun (no duplicate rows or auth users).
 *
 * @module seeds/development/index.seed
 */

import { PrismaClient } from '@prisma/client';
import { SupabaseClient } from '@supabase/supabase-js';

import { seedChurch } from './church.seed';
import { seedCategories } from './categories.seed';
import { seedServices } from './services.seed';
import { seedFormTemplates } from './form-templates.seed';
import { seedMembers } from './members.seed';
import { seedPermissions } from '../shared/permissions.seed';

import { seedBranches } from './branches.seed';

import { seedUsers, UserSeedResult } from './users.seed';

import { seedPeople, assignVisitorFollowUp, PersonSeedResult } from './people.seed';

import { seedGiving } from './giving.seed';
import { seedEvents } from './events.seed';
import { seedAttendance } from './attendance.seed';
import { seedOrg } from './org.seed';
import { seedPastoral } from './pastoral.seed';
import { seedMedia } from './media.seed';
import { seedComm } from './comm.seed';
import { seedAppointments } from './appointments.seed';
import { seedSystem } from './system.seed';

export interface DevelopmentSeedResult {
  churchId: string;
  churchName: string;
  members: number;
  visitors: number;
  authUsersCreated: number;
  authUsersExisting: number;
  profiles: number;
  events: number;
  services: number;
}

export async function runDevelopmentSeed(
  prisma: PrismaClient,
  supabase: SupabaseClient | null,
): Promise<DevelopmentSeedResult> {
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

  console.log('    dept.head.hq@churchos.dev, member.hq@churchos.dev, cell.leader.hq@churchos.dev');

  console.log('  Lekki: branch.pastor@churchos.dev, branch.secretary@churchos.dev,');

  console.log(
    '    branch.treasurer@churchos.dev, branch.depthead@churchos.dev, cell.leader@churchos.dev,',
  );

  console.log('    member.lekki@churchos.dev (plus 5 bulk member accounts)');

  return {
    churchId,
    churchName,
    members: members.length,
    visitors: visitors.length,
    authUsersCreated: users.authUsersCreated,
    authUsersExisting: users.authUsersExisting,
    profiles: Object.keys(profilesByKey).length,
    events: eventsSeed.eventCount,
    services: serviceCount,
  };
}
