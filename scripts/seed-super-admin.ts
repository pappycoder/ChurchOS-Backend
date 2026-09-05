/**
 * @file Seed Super Admin — Interactive console application
 * @description Creates a super_admin user for ChurchOS.
 *
 * The super admin is the main developer account with unrestricted access
 * to all churches, data, and system settings. It creates:
 *   1. A Supabase Auth user (or uses an existing user ID)
 *   2. A "System Administration" church (if none exists)
 *   3. A Profile with role 'super_admin'
 *
 * Usage:
 *   npm run seed-super-admin
 *   ts-node -P tsconfig.scripts.json scripts/seed-super-admin.ts
 *
 * @module scripts/seed-super-admin
 * @since 1.0.0
 */

import 'dotenv/config';
import * as readline from 'readline';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Colours ─────────────────────────────────────────────────

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const red = (s: string): string => `${RED}${s}${RESET}`;
const green = (s: string): string => `${GREEN}${s}${RESET}`;
const yellow = (s: string): string => `${YELLOW}${s}${RESET}`;
const cyan = (s: string): string => `${CYAN}${s}${RESET}`;
const bold = (s: string): string => `${BOLD}${s}${RESET}`;

// ─── Readline ────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// ─── Prisma ──────────────────────────────────────────────────

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ─── Supabase ────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Display helpers ─────────────────────────────────────────

function clearScreen(): void {
  console.clear();
}

function printHeader(): void {
  console.log(`\n${bold('CHURCHOS — Super Admin Setup')}`);
  console.log(`${'─'.repeat(45)}`);
  const dbUrl = process.env.DATABASE_URL || '';
  const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'unknown';
  const dbHost = dbUrl.split('@').pop()?.split('/')[0] || 'unknown';
  console.log(`Database: ${cyan(dbName)} @ ${cyan(dbHost)}`);
  console.log(
    `Supabase: ${supabase ? green('connected') : yellow('not configured (DB-only mode)')}\n`,
  );
}

// ─── Input prompts ───────────────────────────────────────────

async function promptRequired(label: string): Promise<string> {
  while (true) {
    const value = await question(`${label}: `);
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
    console.log(yellow(`  ${label} is required.`));
  }
}

async function promptEmail(): Promise<string> {
  while (true) {
    const email = await promptRequired('Email');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) return email;
    console.log(yellow('  Please enter a valid email address.'));
  }
}

async function promptPassword(): Promise<string> {
  while (true) {
    const password = await question('Password (min 8 chars): ');
    const trimmed = password.trim();
    if (trimmed.length >= 8) return trimmed;
    console.log(yellow('  Password must be at least 8 characters.'));
  }
}

async function promptPhone(): Promise<string> {
  while (true) {
    const phone = await promptRequired('Phone (e.g. +234 801 234 5678)');
    if (phone.startsWith('+') && phone.length >= 10) return phone;
    console.log(yellow('  Please enter a valid international phone number starting with +'));
  }
}

// ─── Core logic ──────────────────────────────────────────────

interface SuperAdminInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

async function collectInput(): Promise<SuperAdminInput> {
  console.log(bold('Enter super admin details:\n'));

  const email = await promptEmail();
  const password = await promptPassword();
  const firstName = await promptRequired('First name');
  const lastName = await promptRequired('Last name');
  const phone = await promptPhone();

  return { email, password, firstName, lastName, phone };
}

function printSummary(input: SuperAdminInput): void {
  console.log(`\n${bold('Review details:')}`);
  console.log(`  Email:    ${input.email}`);
  console.log(`  Name:     ${input.firstName} ${input.lastName}`);
  console.log(`  Phone:    ${input.phone}`);
  console.log(`  Role:     ${cyan('super_admin')}`);
  console.log(`  Access:   ${green('Unrestricted — all churches, all data')}`);
}

async function confirmAction(): Promise<boolean> {
  const result = await question(`\nProceed? (y/N): `);
  return result.trim().toLowerCase() === 'y' || result.trim().toLowerCase() === 'yes';
}

async function ensureSystemChurch(): Promise<string> {
  const systemChurchName = 'System Administration';

  let church = await prisma.church.findFirst({
    where: { name: systemChurchName },
  });

  if (!church) {
    church = await prisma.church.create({
      data: {
        name: systemChurchName,
        denomination: 'System',
        address: 'N/A',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        phone: '',
        email: '',
        config: JSON.stringify({
          timezone: 'Africa/Lagos',
          currency: 'NGN',
          default_language: 'en',
        }),
      },
    });
    console.log(`  ✅ Created system church: ${church.name} (${church.id})`);
  } else {
    console.log(`  ✅ System church exists: ${church.name} (${church.id})`);
  }

  return church.id;
}

async function createSupabaseUser(input: SuperAdminInput): Promise<string | null> {
  if (!supabase) {
    console.log(yellow('  ⚠️  Supabase not configured — using generated user ID'));
    return crypto.randomUUID();
  }

  console.log('  Creating Supabase Auth user...');

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName,
      last_name: input.lastName,
    },
  });

  if (error) {
    if (error.message.includes('already exists')) {
      console.log(yellow('  ⚠️  Auth user already exists — looking up existing user...'));

      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users?.users?.find((u) => u.email === input.email);
      if (existing) {
        console.log(`  ✅ Found existing auth user: ${existing.id}`);
        return existing.id;
      }

      console.log(red('  ❌ Could not find existing auth user.'));
      return null;
    }
    console.log(red(`  ❌ Supabase error: ${error.message}`));
    return null;
  }

  console.log(`  ✅ Auth user created: ${data.user.id}`);
  return data.user.id;
}

async function createSuperAdminProfile(
  userId: string,
  churchId: string,
  input: SuperAdminInput,
): Promise<string> {
  const existing = await prisma.profile.findFirst({
    where: { user_id: userId },
  });

  if (existing) {
    if (existing.role.includes('super_admin')) {
      console.log(`  ✅ Super admin profile already exists: ${existing.id}`);
      return existing.id;
    }

    const updated = await prisma.profile.update({
      where: { id: existing.id },
      data: { role: ['super_admin', ...existing.role], church_id: churchId },
    });
    console.log(`  ✅ Updated existing profile to super_admin: ${updated.id}`);
    return updated.id;
  }

  const profile = await prisma.profile.create({
    data: {
      user_id: userId,
      church_id: churchId,
      role: ['super_admin'],
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
    },
  });

  console.log(`  ✅ Super admin profile created: ${profile.id}`);
  return profile.id;
}

// ─── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    clearScreen();
    printHeader();

    // Check database connectivity
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log(green('  ✅ Database connected\n'));

    // Collect input
    const input = await collectInput();
    printSummary(input);

    if (!(await confirmAction())) {
      console.log(yellow('\nAborted.'));
      return;
    }

    console.log(`\n${bold('Creating super admin...\n')}`);

    // 1. Ensure system church exists
    const churchId = await ensureSystemChurch();

    // 2. Create Supabase Auth user (or get existing)
    const userId = await createSupabaseUser(input);
    if (!userId) {
      console.log(red('\n❌ Failed to create/find auth user. Aborting.'));
      return;
    }

    // 3. Create Profile with super_admin role
    const profileId = await createSuperAdminProfile(userId, churchId, input);

    // Summary
    console.log(`\n${green('🎉 Super admin created successfully!')}\n`);
    console.log(`${bold('Details:')}`);
    console.log(`  User ID:   ${cyan(userId)}`);
    console.log(`  Profile:   ${cyan(profileId)}`);
    console.log(`  Email:     ${input.email}`);
    console.log(`  Name:      ${input.firstName} ${input.lastName}`);
    console.log(`  Role:      ${cyan('super_admin')}`);
    console.log(`  Church:    System Administration (${churchId})`);
    console.log(`\n${yellow('ℹ️  Super admin has unrestricted access to all data.')}\n`);
  } catch (err) {
    console.error(red('Fatal error:'), err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

main();
