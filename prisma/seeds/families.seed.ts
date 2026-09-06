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

  const defs = FAMILY_DEFS.filter((f) => f.headIndex < members.length);
  const names = defs.map((f) => f.name);

  const existing = await prisma.family.findMany({
    where: { church_id: churchId, name: { in: names } },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((f) => f.name));

  const missing = defs.filter((f) => !existingNames.has(f.name));
  if (missing.length > 0) {
    await prisma.family.createMany({
      data: missing.map((f) => ({
        church_id: churchId,
        name: f.name,
        head_id: members[f.headIndex].id,
      })),
    });

    // createMany returns only a count, so re-read to map names -> ids.
    const created = await prisma.family.findMany({
      where: { church_id: churchId, name: { in: missing.map((f) => f.name) } },
      select: { id: true, name: true },
    });

    const memberRows: {
      family_id: string;
      member_id: string;
      relationship: string;
      is_head: boolean;
    }[] = [];
    for (const f of missing) {
      const family = created.find((c) => c.name === f.name);
      if (!family) continue;
      for (const m of f.members) {
        if (m.idx >= members.length) continue;
        memberRows.push({
          family_id: family.id,
          member_id: members[m.idx].id,
          relationship: m.rel,
          is_head: m.rel === 'head',
        });
      }
    }
    if (memberRows.length > 0) {
      // One batched insert; (family_id, member_id) is unique and each family is
      // newly created, so duplicates are impossible.
      await prisma.familyMember.createMany({ data: memberRows });
    }
  }

  let count = 0;
  for (const fam of defs) {
    if (existingNames.has(fam.name)) {
      console.log(`  ⏭️  Family: ${fam.name} already exists`);
    } else {
      console.log(`  ✅ Family: ${fam.name} (${fam.members.length} members)`);
    }
    count++;
  }

  return { familyCount: count };
}
