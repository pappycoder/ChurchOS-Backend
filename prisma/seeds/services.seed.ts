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

  let count = 0;
  for (const svc of SERVICES) {
    const existing = await prisma.service.findFirst({
      where: { church_id: churchId, name: svc.name },
    });

    if (!existing) {
      await prisma.service.create({
        data: {
          church_id: churchId,
          branch_id: branchId,
          name: svc.name,
          day_of_week: svc.day_of_week,
          start_time: svc.start_time,
          end_time: svc.end_time,
          is_active: true,
        },
      });
    }
    count++;
    console.log(`  ✅ Service: ${svc.name}`);
  }

  return { serviceCount: count };
}
