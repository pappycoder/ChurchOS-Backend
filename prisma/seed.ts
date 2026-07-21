/**
 * @file seed.ts
 * @description Database seed script for ChurchOS development environment.
 *
 * Seeds the database with realistic development data including:
 * - 1 church ("Grace Community Church")
 * - 1 headquarters branch
 * - 7 default giving categories
 * - 2 services (Sunday Service, Wednesday Bible Study)
 * - 10 sample members with realistic Nigerian names
 * - 1 admin profile
 *
 * Usage:
 *   npx prisma db seed
 *
 * @module seed
 * @since 1.0.0
 */

import 'dotenv/config';
import {
  PrismaClient,
  MemberStatus,
  TransactionType,
  TransactionStatus,
} from '@prisma/client';
import { seedFormTemplates } from './seeds/form-templates.seed';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/**
 * Generates a UUID v4-like string for Supabase Auth user IDs.
 * In development, we use random UUIDs since Supabase isn't running locally.
 */
function generateSupabaseUserId(): string {
  return crypto.randomUUID();
}

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...\n');

  // ─── 1. Create Church ────────────────────────────────────
  console.log('📦 Creating church...');
  let church = await prisma.church.findFirst({
    where: { name: 'Grace Community Church', city: 'Lagos' },
  });
  if (!church) {
    church = await prisma.church.create({
      data: {
        name: 'Grace Community Church',
        denomination: 'Pentecostal',
        address: '12 Allen Avenue, Ikeja',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        phone: '+234 801 234 5678',
        email: 'info@gracecommunity.ng',
        website: 'https://gracecommunity.ng',
        config: JSON.stringify({
          timezone: 'Africa/Lagos',
          currency: 'NGN',
          default_language: 'en',
          whatsapp_enabled: true,
          attendance_enabled: true,
        }),
      },
    });
  }
  console.log(`  ✅ Church: ${church.name} (${church.id})`);

  // ─── 2. Create Branch ────────────────────────────────────
  console.log('📦 Creating headquarters branch...');
  let branch = await prisma.branch.findFirst({
    where: { church_id: church.id, name: 'Headquarters' },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        church_id: church.id,
        name: 'Headquarters',
        is_headquarters: true,
        address: '12 Allen Avenue, Ikeja',
        city: 'Lagos',
        state: 'Lagos',
        phone: '+234 801 234 5678',
        email: 'hq@gracecommunity.ng',
      },
    });
  }
  console.log(`  ✅ Branch: ${branch.name} (${branch.id})`);

  // ─── 3. Create Giving Categories ─────────────────────────
  console.log('📦 Creating giving categories...');
  const categories = [
    {
      name: 'Tithe',
      description: 'Regular tithe (10% of income)',
      display_order: 1,
      is_recurring: true,
    },
    { name: 'Offering', description: 'General offering', display_order: 2, is_recurring: false },
    { name: 'Seed', description: 'Seed offering', display_order: 3, is_recurring: false },
    {
      name: 'First Fruit',
      description: 'First fruit offering',
      display_order: 4,
      is_recurring: false,
    },
    {
      name: 'Thanksgiving',
      description: 'Thanksgiving offering',
      display_order: 5,
      is_recurring: false,
    },
    {
      name: 'Building Project',
      description: 'Church building project',
      display_order: 6,
      is_recurring: false,
    },
    {
      name: 'Welfare/Mission',
      description: 'Welfare and mission support',
      display_order: 7,
      is_recurring: false,
    },
  ];

  const createdCategories = [];
  for (const cat of categories) {
    // Check if category already exists
    const existing = await prisma.givingCategory.findFirst({
      where: {
        church_id: church.id,
        name: cat.name,
      },
    });

    const created = existing
      ? existing
      : await prisma.givingCategory.create({
          data: {
            church_id: church.id,
            name: cat.name,
            description: cat.description,
            display_order: cat.display_order,
            is_recurring: cat.is_recurring,
          },
        });
    createdCategories.push(created);
    console.log(`  ✅ Category: ${created.name}`);
  }

  // ─── 4. Create Services ──────────────────────────────────
  console.log('📦 Creating services...');
  const sundayServiceData = {
    church_id: church.id,
    branch_id: branch.id,
    name: 'Sunday Service',
    day_of_week: 0, // Sunday
    start_time: new Date('2026-01-01T09:00:00.000Z'),
    end_time: new Date('2026-01-01T12:00:00.000Z'),
    is_active: true,
  };

  const existingSunday = await prisma.service.findFirst({
    where: { church_id: church.id, name: 'Sunday Service' },
  });
  const sundayService = existingSunday
    ? existingSunday
    : await prisma.service.create({ data: sundayServiceData });

  const wednesdayServiceData = {
    church_id: church.id,
    branch_id: branch.id,
    name: 'Wednesday Bible Study',
    day_of_week: 3, // Wednesday
    start_time: new Date('2026-01-01T18:00:00.000Z'),
    end_time: new Date('2026-01-01T20:00:00.000Z'),
    is_active: true,
  };

  const existingWednesday = await prisma.service.findFirst({
    where: { church_id: church.id, name: 'Wednesday Bible Study' },
  });
  const wednesdayService = existingWednesday
    ? existingWednesday
    : await prisma.service.create({ data: wednesdayServiceData });

  console.log(`  ✅ Service: ${sundayService.name}`);
  console.log(`  ✅ Service: ${wednesdayService.name}`);

  // ─── 5. Create Members ───────────────────────────────────
  console.log('📦 Creating members...');
  const membersData = [
    {
      first_name: 'Adebayo',
      last_name: 'Ogundimu',
      email: 'adebayo.ogundimu@gmail.com',
      phone: '+234 803 456 7890',
      gender: 'male',
      date_of_birth: new Date('1985-03-15'),
    },
    {
      first_name: 'Chioma',
      last_name: 'Nwosu',
      email: 'chioma.nwosu@gmail.com',
      phone: '+234 805 678 9012',
      gender: 'female',
      date_of_birth: new Date('1990-07-22'),
    },
    {
      first_name: 'Emeka',
      last_name: 'Okonkwo',
      email: 'emeka.okonkwo@outlook.com',
      phone: '+234 807 890 1234',
      gender: 'male',
      date_of_birth: new Date('1988-11-08'),
    },
    {
      first_name: 'Fatima',
      last_name: 'Abdullahi',
      email: 'fatima.abdullahi@yahoo.com',
      phone: '+234 809 012 3456',
      gender: 'female',
      date_of_birth: new Date('1992-04-30'),
    },
    {
      first_name: 'Olumide',
      last_name: 'Adeyemi',
      email: 'olumide.adeyemi@gmail.com',
      phone: '+234 811 234 5678',
      gender: 'male',
      date_of_birth: new Date('1978-09-12'),
    },
    {
      first_name: 'Ngozi',
      last_name: 'Eze',
      email: 'ngozi.eze@gmail.com',
      phone: '+234 813 456 7890',
      gender: 'female',
      date_of_birth: new Date('1995-01-25'),
    },
    {
      first_name: 'Tunde',
      last_name: 'Bakare',
      email: 'tunde.bakare@outlook.com',
      phone: '+234 815 678 9012',
      gender: 'male',
      date_of_birth: new Date('1982-06-18'),
    },
    {
      first_name: 'Aisha',
      last_name: 'Mohammed',
      email: 'aisha.mohammed@gmail.com',
      phone: '+234 817 890 1234',
      gender: 'female',
      date_of_birth: new Date('1993-12-03'),
    },
    {
      first_name: 'Kunle',
      last_name: 'Fashola',
      email: 'kunle.fashola@yahoo.com',
      phone: '+234 819 012 3456',
      gender: 'male',
      date_of_birth: new Date('1987-08-27'),
    },
    {
      first_name: 'Blessing',
      last_name: 'Effiong',
      email: 'blessing.effiong@gmail.com',
      phone: '+234 821 234 5678',
      gender: 'female',
      date_of_birth: new Date('1998-02-14'),
    },
  ];

  const createdMembers = [];
  for (let i = 0; i < membersData.length; i++) {
    const memberData = membersData[i];
    const member = await prisma.member.create({
      data: {
        church_id: church.id,
        branch_id: branch.id,
        first_name: memberData.first_name,
        last_name: memberData.last_name,
        email: memberData.email,
        phone: memberData.phone,
        whatsapp_number: memberData.phone,
        gender: memberData.gender,
        date_of_birth: memberData.date_of_birth,
        status: MemberStatus.active,
        member_since: new Date(2024, i % 12, 1),
      },
    });
    createdMembers.push(member);
    console.log(`  ✅ Member: ${member.first_name} ${member.last_name}`);
  }

  // ─── 6. Create Admin Profile ─────────────────────────────
  console.log('📦 Creating admin profile...');
  const adminUserId = generateSupabaseUserId();
  const adminMember = createdMembers[0]; // Use first member as admin

  const adminProfile = await prisma.profile.upsert({
    where: { user_id: adminUserId },
    update: {},
    create: {
      user_id: adminUserId,
      church_id: church.id,
      branch_id: branch.id,
      member_id: adminMember.id,
      role: 'church_admin',
      first_name: adminMember.first_name,
      last_name: adminMember.last_name,
      phone: adminMember.phone,
    },
  });
  console.log(
    `  ✅ Admin Profile: ${adminProfile.first_name} ${adminProfile.last_name} (${adminProfile.role})`,
  );

  // ─── 7. Create Sample Transactions ───────────────────────
  console.log('📦 Creating sample transactions...');
  const titheCategory = createdCategories.find((c) => c.name === 'Tithe');
  const offeringCategory = createdCategories.find((c) => c.name === 'Offering');

  if (titheCategory && offeringCategory) {
    // Create a few sample transactions for the first 3 members
    for (let i = 0; i < 3; i++) {
      const member = createdMembers[i];
      const amount = Math.floor(Math.random() * 50000) + 10000; // 10,000 - 60,000 NGN

      await prisma.transaction.create({
        data: {
          church_id: church.id,
          branch_id: branch.id,
          member_id: member.id,
          category_id: titheCategory.id,
          amount,
          currency: 'NGN',
          type: TransactionType.digital,
          status: TransactionStatus.success,
          payment_reference: `TITHSEED${Date.now()}${i}`,
          payment_method: 'card',
          payment_gateway: 'paystack',
          receipt_number: `GCC/TIT/2026/${String(i + 1).padStart(4, '0')}`,
        },
      });
      console.log(
        `  ✅ Transaction: ${member.first_name} gave ₦${amount.toLocaleString()} (Tithe)`,
      );
    }
  }

  // ─── 8. Create Roles ──────────────────────────────────────
  console.log('\n📦 Creating roles...');
  const roleNames = [
    'super_admin',
    'church_admin',
    'branch_pastor',
    'department_head',
    'secretary',
    'treasurer',
    'member',
  ] as const;

  const createdRoles: { id: string; name: string }[] = [];
  for (const roleName of roleNames) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    createdRoles.push(role);
    console.log(`  ✅ Role: ${role.name}`);
  }

  // ─── 9. Create Permissions ────────────────────────────────
  console.log('📦 Creating permissions...');
  const resources = ['members', 'attendance', 'giving', 'events', 'sermons', 'media', 'church', 'branches', 'profiles', 'whatsapp', 'reports', 'forms'];
  const actions = ['create', 'read', 'update', 'delete'] as const;

  const permissionMatrix: Record<string, string[]> = {
    super_admin: resources.flatMap((r) => actions.map((a) => `${r}:${a}`)),
    church_admin: resources.flatMap((r) => actions.map((a) => `${r}:${a}`)),
    branch_pastor: [
      'members:read', 'members:update',
      'attendance:create', 'attendance:read',
      'events:create', 'events:read', 'events:update',
      'sermons:create', 'sermons:read', 'sermons:update',
      'media:read',
      'profiles:read',
      'reports:read',
    ],
    department_head: [
      'members:read',
      'attendance:create', 'attendance:read',
      'events:read',
      'media:read',
    ],
    secretary: [
      'members:create', 'members:read', 'members:update',
      'attendance:create', 'attendance:read',
      'events:create', 'events:read', 'events:update',
      'profiles:read',
    ],
    treasurer: [
      'giving:create', 'giving:read', 'giving:update',
      'reports:read',
    ],
    member: [
      'members:read',
      'events:read',
      'sermons:read',
      'media:read',
      'profiles:read',
    ],
  };

  const createdPermissions: { id: string; name: string }[] = [];
  for (const resource of resources) {
    for (const action of actions) {
      const permName = `${resource}:${action}`;
      const perm = await prisma.permission.upsert({
        where: { name: permName },
        update: {},
        create: {
          name: permName,
          resource,
          action,
        },
      });
      createdPermissions.push(perm);
    }
  }
  console.log(`  ✅ Permissions: ${createdPermissions.length}`);

  // ─── 10. Assign Permissions to Roles ─────────────────────
  console.log('📦 Assigning permissions to roles...');
  for (const role of createdRoles) {
    const allowed = permissionMatrix[role.name] || [];
    for (const permName of allowed) {
      const perm = createdPermissions.find((p) => p.name === permName);
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { role_id_permission_id: { role_id: role.id, permission_id: perm.id } },
          update: {},
          create: { role_id: role.id, permission_id: perm.id },
        });
      }
    }
    console.log(`  ✅ Assigned ${allowed.length} permissions to ${role.name}`);
  }

  // ─── 11. Create Families ──────────────────────────────────
  console.log('📦 Creating families...');
  const familyData = [
    { name: 'Ogundimu Family', headIndex: 0, members: [{ idx: 0, rel: 'head' }, { idx: 1, rel: 'spouse' }] },
    { name: 'Okonkwo Family', headIndex: 2, members: [{ idx: 2, rel: 'head' }, { idx: 5, rel: 'spouse' }] },
    { name: 'Adeyemi Family', headIndex: 4, members: [{ idx: 4, rel: 'head' }] },
  ];

  for (const fam of familyData) {
    const family = await prisma.family.create({
      data: {
        church_id: church.id,
        name: fam.name,
        head_id: createdMembers[fam.headIndex].id,
      },
    });
    for (const m of fam.members) {
      await prisma.familyMember.create({
        data: {
          family_id: family.id,
          member_id: createdMembers[m.idx].id,
          relationship: m.rel,
          is_head: m.rel === 'head',
        },
      });
    }
    console.log(`  ✅ Family: ${family.name} (${fam.members.length} members)`);
  }

  // ─── 12. Create Default Form Templates ───────────────────
  await seedFormTemplates(prisma, church.id);

  // ─── Summary ─────────────────────────────────────────────
  console.log('\n🎉 Seed completed successfully!\n');
  console.log('Summary:');
  console.log(`  • Church: ${church.name}`);
  console.log(`  • Branch: ${branch.name}`);
  console.log(`  • Categories: ${createdCategories.length}`);
  console.log(`  • Services: 2`);
  console.log(`  • Members: ${createdMembers.length}`);
  console.log(`  • Admin: ${adminProfile.first_name} ${adminProfile.last_name}`);
  console.log(`  • Transactions: 3`);
  console.log(`  • Roles: ${createdRoles.length}`);
  console.log(`  • Permissions: ${createdPermissions.length}`);
  console.log(`  • Families: ${familyData.length}`);
  console.log(`  • Form Templates: 5`);
  console.log(
    '\n📌 Note: Admin user ID is a placeholder. Connect to Supabase Auth for real users.\n',
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
