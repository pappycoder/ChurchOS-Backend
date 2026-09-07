/**
 * @file services.seed.ts
 * @description Seeds default church services.
 * Idempotent — skips services that already exist for the church.
 */

import { PrismaClient } from '@prisma/client';

export interface ServiceSeedResult {
  serviceCount: number;
}

const SERVICES = [
  {
    name: 'Sunday Service',
    day_of_week: 0,
    start_time: new Date('2026-01-01T09:00:00.000Z'),
    end_time: new Date('2026-01-01T12:00:00.000Z'),
  },
  {
    name: 'Wednesday Bible Study',
    day_of_week: 3,
    start_time: new Date('2026-01-01T18:00:00.000Z'),
    end_time: new Date('2026-01-01T20:00:00.000Z'),
  },
];

export async function seedServices(
  prisma: PrismaClient,
  churchId: string,
  branchId: string,
): Promise<ServiceSeedResult> {
  console.log('📦 Seeding services...');

  const names = SERVICES.map((s) => s.name);
  const existing = await prisma.service.findMany({
    where: { church_id: churchId, name: { in: names } },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((s) => s.name));

  const missing = SERVICES.filter((s) => !existingNames.has(s.name));
  if (missing.length > 0) {
    await prisma.service.createMany({
      data: missing.map((s) => ({
        ...s,
        church_id: churchId,
        branch_id: branchId,
        is_active: true,
      })),
    });
  }

  let count = 0;
  for (const svc of SERVICES) {
    count++;
    console.log(`  ✅ Service: ${svc.name}`);
  }

  return { serviceCount: count };
}
