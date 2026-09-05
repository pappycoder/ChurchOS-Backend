/**
 * @file families.seed.ts
 * @description Seeds sample family groups with member associations.
 * Idempotent — skips families that already exist for the church.
 */

import { PrismaClient } from '@prisma/client';

export interface FamilySeedResult {
  familyCount: number;
}

interface FamilyDef {
  name: string;
  headIndex: number;
  members: { idx: number; rel: string }[];
}

const FAMILY_DEFS: FamilyDef[] = [
  {
    name: 'Ogundimu Family',
    headIndex: 0,
    members: [
      { idx: 0, rel: 'head' },
      { idx: 1, rel: 'spouse' },
    ],
  },
  {
    name: 'Okonkwo Family',
    headIndex: 2,
    members: [
      { idx: 2, rel: 'head' },
      { idx: 5, rel: 'spouse' },
    ],
  },
  { name: 'Adeyemi Family', headIndex: 4, members: [{ idx: 4, rel: 'head' }] },
];

export async function seedFamilies(
  prisma: PrismaClient,
  churchId: string,
  members: { id: string }[],
): Promise<FamilySeedResult> {
  console.log('📦 Seeding families...');

  let count = 0;
  for (const fam of FAMILY_DEFS) {
    if (fam.headIndex >= members.length) continue;

    const existing = await prisma.family.findFirst({
      where: { church_id: churchId, name: fam.name },
    });

    if (existing) {
      console.log(`  ⏭️  Family: ${fam.name} already exists`);
      count++;
      continue;
    }

    const family = await prisma.family.create({
      data: {
        church_id: churchId,
        name: fam.name,
        head_id: members[fam.headIndex].id,
      },
    });

    for (const m of fam.members) {
      if (m.idx >= members.length) continue;
      await prisma.familyMember.create({
        data: {
          family_id: family.id,
          member_id: members[m.idx].id,
          relationship: m.rel,
          is_head: m.rel === 'head',
        },
      });
    }

    count++;
    console.log(`  ✅ Family: ${family.name} (${fam.members.length} members)`);
  }

  return { familyCount: count };
}
