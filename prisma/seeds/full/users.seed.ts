/**
 * @file users.seed.ts
 * @description Seeds REAL Supabase Auth users + linked ChurchOS Profiles for
 * every role, in both the HQ (is_admin_hq = true) and a non-HQ branch
 * (is_admin_hq = false, seated at Lekki Campus).
 *
 * Dev sign-in password (shared): ChurchOS@1234
 *
 * Idempotent: looks up existing auth user by email first, creates only when
 * missing; never duplicates. Profiles are matched by user_id/@unique.
 */

import { PrismaClient } from '@prisma/client';
import { SupabaseClient } from '@supabase/supabase-js';

export const DEV_PASSWORD = 'ChurchOS@1234';

export const EMAIL_DOMAIN = 'churchos.dev';

export interface AuthUserSeed {
  email: string;
  password: string;
}

export interface UserSeedResult {
  profilesByKey: Record<string, string>; // key -> profile.id
  usersByKey: Record<string, string>;   // key -> auth user.id
  authUsersCreated: number;
  authUsersExisting: number;
}

interface UserDef {
  key: string;           // short logical id used by other seeds
  email: string;          // full login email
  firstName: string;
  lastName: string;
  role: string[];        // role[0] = primary
  branch: 'hq' | 'lekki';
  isAdminHq: boolean;
  memberIndex?: number;   // link to members.seed.ts MEMBERS[idx] (creates a Profile.member_id link)
}

/**
 * Ordered late-binding: members parameter lets the caller pass the seeded
 * members so keyboard member profiles can link member_id.
 */
export async function seedUsers(
  prisma: PrismaClient,
  supabase: SupabaseClient | null,
  churchId: string,
  hqBranchId: string,
  lekkiBranchId: string,
  members: { id: string; first_name: string; last_name: string; phone: string | null }[],
): Promise<UserSeedResult> {
  console.log('📦 Seeding auth users + profiles...');

  const branchIdFor = (b: 'hq' | 'lekki'): string => (b === 'hq' ? hqBranchId : lekkiBranchId);

  const result: UserSeedResult = {
    profilesByKey: {},
    usersByKey: {},
    authUsersCreated: 0,
    authUsersExisting: 0,
  };

  const USERS: UserDef[] = [
    // ── HQ staff (is_admin_hq = true — church-wide scope) ──────
    { key: 'super_admin',   email: `superadmin@${EMAIL_DOMAIN}`,                        firstName: 'Adaora', lastName: 'Nwachukwu', role: ['super_admin'],   branch: 'hq',    isAdminHq: true },
    { key: 'senior_pastor', email: `senior.pastor@${EMAIL_DOMAIN}`,                   firstName: 'David',   lastName: 'Adeyemi',    role: ['senior_pastor'], branch: 'hq',    isAdminHq: true },
    { key: 'church_admin',  email: `admin@${EMAIL_DOMAIN}`,         firstName: 'Grace',     lastName: 'Okafor',      role: ['church_admin'],    branch: 'hq',    isAdminHq: true },
    { key: 'treasurer',      email: `treasurer.hq@${EMAIL_DOMAIN}`,  firstName: 'Toluope',  lastName: 'Balogun',     role: ['treasurer'],       branch: 'hq',    isAdminHq: true },
    { key: 'secretary',      email: `secretary.hq@${EMAIL_DOMAIN}`,  firstName: 'Funmilayo', lastName: 'Adesina',     role: ['secretary'],      branch: 'hq',    isAdminHq: true },
    { key: 'dept_head',      email: `dept.head.hq@${EMAIL_DOMAIN}`,  firstName: 'Kelechi',   lastName: 'Obi',          role: ['department_head'], branch: 'hq',    isAdminHq: true },
    { key: 'member_hq',      email: `member.hq@${EMAIL_DOMAIN}`,      firstName: 'Adebayo',   lastName: 'Ogundimu',   role: ['member'],         branch: 'hq',    isAdminHq: false, memberIndex: 0 },

    // ── Lekki branch staff(is_admin_hq = false — branch-scoped context) ──────
    { key: 'branch_pastor',   email: `branch.pastor@${EMAIL_DOMAIN}`,   firstName: 'Samuel',     lastName: 'Bamidele',   role: ['branch_pastor'],   branch: 'lekki', isAdminHq: false },
    { key: 'branch_secretary', email: `branch.secretary@${EMAIL_DOMAIN}`, firstName: 'Ifeoma',    lastName: 'Eze',          role: ['secretary'],        branch: 'lekki', isAdminHq: false },
    { key: 'branch_treasurer', email: `branch.treasurer@${EMAIL_DOMAIN}`, firstName: 'Abdulmalik', lastName: 'Yusuf',       role: ['treasurer'],        branch: 'lekki', isAdminHq: false },
    { key: 'branch_dept_head', email: `branch.depthead@${EMAIL_DOMAIN}`, firstName: 'Chinwe',    lastName: 'Odoemelam', role: ['department_head'],  branch: 'lekki', isAdminHq: false },
    { key: 'cell_leader',     email: `cell.leader@${EMAIL_DOMAIN}`,   firstName: 'Emeka',     lastName: 'Okonkwo',    role: ['cell_leader', 'member'], branch: 'lekki', isAdminHq: false, memberIndex: 2 },
    { key: 'member_lekki',   email: `member.lekki@${EMAIL_DOMAIN}`,  firstName: 'Tunde',     lastName: 'Bakare',     role: ['member'],          branch: 'lekki', isAdminHq: false, memberIndex: 6 },
  ];

  // ── Bulk member auth accounts (remaining seeded members — login-able) ──
  const BULK_MEMBER_INDICES: { idx: number; branch: 'hq' | 'lekki' }[] = [
    { idx: 3, branch: 'hq' },    // Fatima Abdullahi
    { idx: 5, branch: 'lekki' },  // Ngozi Eze
    { idx:  7, branch: 'hq' },    // Aisha Mohammed
    { idx: 8, branch: 'lekki' },  // Kunle Fashola
    { idx:  9, branch: 'hq' },    // Blessing Effiong
  ];

  const ensureAuthUser = async (email: string, firstName: string, lastName: string): Promise<string | null> => {
    if (!supabase) return crypto.randomUUID(); // DB-only fallback
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage:  1000 });
    if (error) {
      console.warn(`  ⚠️  Could not list auth users: ${error.message} — will try create directly`);
    } else {
      const existing = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (existing) {
        result.authUsersExisting++;
        return existing.id;  // idempotent path
      }
    }
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    if (createError) {
      // Race: user may have been created between our list and create.
      if (/already (been\s+)?regist/i.test(createError.message ?? '')) {
        const { data: again } = await supabase.auth.admin.listUsers({ page:  1, perPage:  1000 });
        const dup = again?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (dup) { result.authUsersExisting++; return dup.id; }
        console.warn(`  ⚠️  Could not resolve existing auth user ${email}: ${createError.message}`);
        return null;
      }
      console.warn(`  ⚠️  Could not create auth user ${email}: ${createError.message}`);
      return null;
    }
    result.authUsersCreated++;
    return created?.user?.id ?? null;
  };

  const upsertProfile = async (def: UserDef, userId: string): Promise<string | null> => {
    const linkedMember = def.memberIndex !== undefined ? members[def.memberIndex] : undefined;
    const profileData = {
      user_id: userId,
      church_id: churchId,
      branch_id: branchIdFor(def.branch),
      role: def.role,
      is_admin_hq: def.isAdminHq ?? false,
      first_name: def.firstName,
      last_name: def.lastName,
      email: def.email,
      ...(linkedMember ? { member_id: linkedMember.id, phone: linkedMember.phone ?? undefined } : {}),
    };
    let profile = await prisma.profile.findUnique({ where: { user_id: userId } });
    if (!profile) profile = await prisma.profile.create({ data: profileData });
    else profile = await prisma.profile.update({ where: { id: profile.id }, data: profileData });
    return profile.id;
  };

  // ── Staff + member-role users ─────────────────────────────────────
  for (const def of USERS) {
    const userId = await ensureAuthUser(def.email, def.firstName, def.lastName);
    if (!userId) continue;
    const profileId = await upsertProfile(def, userId);
    if (!profileId) continue;
    result.profilesByKey[def.key] = profileId;
    result.usersByKey[def.key] = userId;
    console.log(`  ✅ ${def.key}: ${def.email} (${def.role[0]}) — ${def.branch.toUpperCase()}`);
  }

  // ── Bulk member accounts ────────────────────────────────────────────
  for (const b of BULK_MEMBER_INDICES) {
    const m = members[b.idx];
    if (!m) continue;
    const def: UserDef = {
      key: `bulk_member_${b.idx}`,
      email: `${m.first_name.toLowerCase()}.${m.last_name.toLowerCase()}@${EMAIL_DOMAIN}`,
      firstName: m.first_name,
      lastName: m.last_name,
      role: ['member'],
      branch: b.branch,
      isAdminHq: false,
      memberIndex: b.idx,
    };
    const userId = await ensureAuthUser(def.email, def.firstName, def.lastName);
    if (!userId) continue;
    const profileId = await upsertProfile(def, userId);
    if (!profileId) continue;
    result.profilesByKey[def.key] = profileId;
    result.usersByKey[def.key] = userId;
    console.log(`  ✅ ${def.key}: ${def.email} (member) — ${def.branch.toUpperCase()}`);
  }

  console.log(
    `  🎉 Auth users: ${result.authUsersCreated} created, ${result.authUsersExisting} existing; profiles: ${Object.keys(result.profilesByKey).length}`,
  );

  return result;
}

