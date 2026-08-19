/**
 * @file seed.ts
 * @description Database seed script for ChurchOS development environment.
 *
 * Orchestrates modular seed functions to populate the database with
 * realistic development data. Each seed function is idempotent — safe
 * to run multiple times without duplicating data.
 *
 * Seed modules:
 *   - church.seed.ts       Church + headquarters branch
 *   - categories.seed.ts   Giving categories
 *   - services.seed.ts     Church services
 *   - members.seed.ts      Sample members
 *   - profiles.seed.ts     Admin profile
 *   - transactions.seed.ts Sample transactions
 *   - families.seed.ts     Family groups
 *   - permissions.seed.ts  Roles, permissions, default mappings
 *   - form-templates.seed.ts Default form templates
 *
 * Usage:
 *   npx prisma db seed
 *   npm run prisma:seed
 *
 * @module seed
 * @since 1.0.0
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedChurch } from './seeds/church.seed';
import { seedCategories } from './seeds/categories.seed';
import { seedServices } from './seeds/services.seed';
import { seedMembers } from './seeds/members.seed';
import { seedProfiles } from './seeds/profiles.seed';
import { seedTransactions } from './seeds/transactions.seed';
import { seedFamilies } from './seeds/families.seed';
import { seedPermissions } from './seeds/permissions.seed';
import { seedFormTemplates } from './seeds/form-templates.seed';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...\n');

  const { churchId, branchId, churchName } = await seedChurch(prisma);
  const { categoryCount } = await seedCategories(prisma, churchId);
  const { serviceCount } = await seedServices(prisma, churchId, branchId);
  const { members, memberCount, firstMemberPhone } = await seedMembers(prisma, churchId, branchId);
  const { adminProfileId } = await seedProfiles(prisma, churchId, branchId, {
    ...members[0],
    phone: firstMemberPhone,
  });
  const { transactionCount } = await seedTransactions(prisma, churchId, branchId, members);
  await seedPermissions(prisma);
  const { familyCount } = await seedFamilies(prisma, churchId, members);
  await seedFormTemplates(prisma, churchId);

  console.log('\n🎉 Seed completed successfully!\n');
  console.log('Summary:');
  console.log(`  • Church: ${churchName}`);
  console.log(`  • Categories: ${categoryCount}`);
  console.log(`  • Services: ${serviceCount}`);
  console.log(`  • Members: ${memberCount}`);
  console.log(`  • Admin Profile: ${adminProfileId}`);
  console.log(`  • Transactions: ${transactionCount}`);
  console.log(`  • Roles, Permissions & Mappings: See permissions.seed.ts output above`);
  console.log(`  • Families: ${familyCount}`);
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
