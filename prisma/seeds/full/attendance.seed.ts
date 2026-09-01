/**
 * @file attendance.seed.ts
 * @description Seeds attendance records (regular, event-linked, visitor walk-ins).
 */

import { PrismaClient } from '@prisma/client';

export interface AttendanceSeedResult {
  attendanceCount: number;
}

// [serviceIdx, memberIdx, branch, category?, source?]
const ATT_DEFS: Array<[number, number, 'hq' | 'lekki', string?, string?]> = [
  [0,0,'hq','adult','manual'],
  [0,1,'hq','adult','manual'],
  [0,2,'hq','adult','qr'],
  [0,3,'hq','adult','whatsapp'],
  [0,4,'hq','adult','manual'],
  [0,10,'hq','adult','manual'],
  [0,11,'hq','adult','manual'],
  [1,0,'hq','adult','whatsapp'],
  [1,2,'hq','adult','manual'],
  [2,14,'lekki','adult','manual'],
  [2,15,'lekki','adult','manual'],
  [2,16,'lekki','adult','qr'],
  [2,17,'lekki','adult','manual'],
  [3,14,'lekki','adult','manual'],
];

export async function seedAttendance(
  prisma: PrismaClient,
  churchId: string,
  members: { id: string }[],
  services: { id: string }[],
  events: { id: string }[],
  visitors: { id: string }[],
): Promise<AttendanceSeedResult> {
  console.log('📦 Seeding attendance...');

   const existingCount = await prisma.attendance.count({
    where: { church_id: churchId },
  });
   if (existingCount > 0) {
    console.log(`  ⏭️  ${existingCount} attendance records exist, skipping`);
    return { attendanceCount: existingCount };
  }

   let count = 0;
   for (const a of ATT_DEFS) {
    const serviceIndex = a[0];
    const memberIndex = a[1];
    const branchCategory = a[3] ?? 'adult';
    const source = a[4] ?? 'manual';
    if (!services[serviceIndex] || !members[memberIndex]) continue;
    await prisma.attendance.create({
      data: {
        church_id: churchId,
        service_id: services[serviceIndex].id,
        member_id: members[memberIndex].id,
        category: branchCategory,
        source,
        checkin_at: new Date('2026-08-30T09:30:00Z'),
      },
    });
    count++;
  }

   // Event-linked attendance
   if (events[0]) {
    for (const mi of [0,1,4,10]) {
      if (!members[mi]) continue;
      await prisma.attendance.create({
        data: {
          church_id: churchId,
          event_id: events[0].id,
          member_id: members[mi].id,
          category: 'adult',
          source: 'manual',
          checkin_at: new Date('2026-10-15T09:15:00Z'),
        },
      });
      count++;
    }
  }

   // Visitor walk-ins
   if (services[0] && visitors[0]) {
    await prisma.attendance.create({
      data: {
        church_id: churchId,
        service_id: services[0].id,
        visitor_id: visitors[0].id,
        visitor_name: 'Chidera Umeh',
        category: 'adult',
        source: 'manual',
        checkin_at: new Date('2026-08-30T10:00:00Z'),
      },
    });
    count++;
  }
   if (services[2] && visitors[2]) {
    await prisma.attendance.create({
      data: {
        church_id: churchId,
        service_id: services[2].id,
        visitor_id: visitors[2].id,
        visitor_name: 'Amara Okeke',
        category: 'adult',
        source: 'whatsapp',
        checkin_at: new Date('2026-08-23T09:40:00Z'),
      },
    });
    count++;
  }

   console.log(`  🎉 Attendance records: ${count}`);
   return { attendanceCount: count };
}
