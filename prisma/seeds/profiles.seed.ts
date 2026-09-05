/**
 * @file profiles.seed.ts
 * @description Seeds the admin profile for development.
 * Idempotent — skips if an admin profile already exists for the church.
 */

import { PrismaClient } from '@prisma/client';

export interface ProfileSeedResult {
  adminUserId: string;
  adminProfileId: string;
  secretaryProfileId: string;
}

export async function seedProfiles(
  prisma: PrismaClient,
  churchId: string,
  branchId: string,
  adminMember: { id: string; first_name: string; last_name: string; phone: string | null },
): Promise<ProfileSeedResult> {
  console.log('📦 Seeding admin profile...');

  let profile = await prisma.profile.findFirst({
    where: { church_id: churchId, role: { has: 'church_admin' } },
  });

  if (!profile) {
    const userId = crypto.randomUUID();
    profile = await prisma.profile.create({
      data: {
        user_id: userId,
        church_id: churchId,
        branch_id: branchId,
        member_id: adminMember.id,
        role: ['church_admin'],
        // church_admin defaults to HQ access (cross-branch reads), matching the
        // auth-service rule — otherwise the appointment contact pickers would
        // treat an admin with a null/own branch as branch-scoped and return 0.
        is_admin_hq: true,
        first_name: adminMember.first_name,
        last_name: adminMember.last_name,
        phone: adminMember.phone,
      },
    });
  }

  console.log(
    `  ✅ Admin Profile: ${profile.first_name} ${profile.last_name} (${profile.role.join(', ')})`,
  );

  // Seed a secretary profile so the appointments/booking registry has a
  // pairing counterpart (secretary ↔ pastor) to book against in dev.
  // The row is visible to the contact picker; a real login is provisioned via
  // the Supabase invite flow in production.
  let secretary = await prisma.profile.findFirst({
    where: { church_id: churchId, role: { has: 'secretary' } },
  });

  if (!secretary) {
    secretary = await prisma.profile.create({
      data: {
        user_id: crypto.randomUUID(),
        church_id: churchId,
        branch_id: branchId,
        role: ['secretary'],
        first_name: 'Grace',
        last_name: 'Okafor',
        phone: '08030000002',
        email: 'grace.okafor@example.com',
      },
    });
    console.log(`  ✅ Secretary Profile: ${secretary.first_name} ${secretary.last_name}`);
  }

  return {
    adminUserId: profile.user_id,
    adminProfileId: profile.id,
    secretaryProfileId: secretary.id,
  };
}
