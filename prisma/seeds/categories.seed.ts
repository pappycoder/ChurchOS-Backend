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
];

export async function seedCategories(
  prisma: PrismaClient,
  churchId: string,
): Promise<CategorySeedResult> {
  console.log('📦 Seeding giving categories...');

  let count = 0;
  for (const cat of CATEGORIES) {
    const existing = await prisma.givingCategory.findFirst({
      where: { church_id: churchId, name: cat.name },
    });

    if (!existing) {
      await prisma.givingCategory.create({
        data: {
          church_id: churchId,
          name: cat.name,
          description: cat.description,
          display_order: cat.display_order,
          is_recurring: cat.is_recurring,
        },
      });
    }
    count++;
    console.log(`  ✅ Category: ${cat.name}`);
  }

  return { categoryCount: count };
}
