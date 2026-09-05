/**
 * @file church.seed.ts
 * @description Seeds the default church and headquarters branch.
 * Idempotent — skips if the church already exists.
 */

import { PrismaClient } from '@prisma/client';

export interface ChurchSeedResult {
  churchId: string;
  branchId: string;
  churchName: string;
}

export async function seedChurch(prisma: PrismaClient): Promise<ChurchSeedResult> {
  console.log('📦 Seeding church...');

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

  console.log('📦 Seeding headquarters branch...');
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

  return { churchId: church.id, branchId: branch.id, churchName: church.name };
}
