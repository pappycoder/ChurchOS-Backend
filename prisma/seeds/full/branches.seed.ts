/**
 * @file branches.seed.ts
 * @description Seeds a second, non-HQ branch (Lekki Campus) so every
 * role can be tested in both HQ and non-HQ (branch-scoped) contexts.
 */

import { PrismaClient } from '@prisma/client';

export interface BranchSeedResult {
  hqBranchId: string;
  lekkiBranchId: string;
}

export async function seedBranches(
  prisma: PrismaClient,
  churchId: string,
  hqBranchId: string,
): Promise<BranchSeedResult> {
  console.log('📦 Seeding branches...');

  const existing = await prisma.branch.findFirst({
    where: { church_id: churchId, name: 'Lekki Campus' },
  });

  let branchId = existing?.id ?? '';
  if (!branchId) {
    const branch = await prisma.branch.create({
      data: {
        church_id: churchId,
        name: 'Lekki Campus',
        is_headquarters: false,
        address: '15A Admiralty Way, Lekki Phase 1',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        phone: '+234 802 345 6789',
        email: 'lekki@gracecommunity.ng',
      },
    });
    branchId = branch.id;
    console.log(`  ✅ Branch: ${branch.name} (${branch.id})`);
  } else {
    console.log(`  ⏭️  Branch: Lekki Campus already exists`);
  }

  return { hqBranchId, lekkiBranchId: branchId };
}