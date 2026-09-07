/**
 * @file categories.seed.ts
 * @description Seeds default giving categories.
 * Idempotent — skips categories that already exist for the church.
 */

import { PrismaClient } from '@prisma/client';

export interface CategorySeedResult {
  categoryCount: number;
}

const CATEGORIES = [
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
  {
    name: 'Gift',
    description: 'General gift',
    display_order: 8,
    is_recurring: false,
  },
  {
    name: 'Venison',
    description: 'Venison giving',
    display_order: 9,
    is_recurring: false,
  },
  {
    name: 'Overall Total',
    description: 'Aggregate total collected for a service or event (recorded as one entry)',
    display_order: 10,
    is_recurring: false,
  },
];

export async function seedCategories(
  prisma: PrismaClient,
  churchId: string,
): Promise<CategorySeedResult> {
  console.log('📦 Seeding giving categories...');

  const names = CATEGORIES.map((c) => c.name);
  const existing = await prisma.givingCategory.findMany({
    where: { church_id: churchId, name: { in: names } },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((c) => c.name));

  const missing = CATEGORIES.filter((c) => !existingNames.has(c.name));
  if (missing.length > 0) {
    // Pre-filtered to only missing rows (no unique constraint on name), so no
    // skipDuplicates needed — but it is still a single batched insert.
    await prisma.givingCategory.createMany({
      data: missing.map((c) => ({ ...c, church_id: churchId })),
    });
  }

  let count = 0;
  for (const cat of CATEGORIES) {
    count++;
    console.log(`  ✅ Category: ${cat.name}`);
  }

  return { categoryCount: count };
}
