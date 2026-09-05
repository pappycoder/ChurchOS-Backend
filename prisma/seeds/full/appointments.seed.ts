/**
 * @file appointments.seed.ts
 * @description Seeds appointments pairing secretaries with pastors — one HQ
 * (church-wide scope)and one Lekki (branch-scoped scope), plus a visitor-Who.
 */

import { PrismaClient } from '@prisma/client';

export async function seedAppointments(
  prisma: PrismaClient,
  churchId: string,
  hqBranchId: string,
  profiles: Record<string, string>,
  visitors: { id: string }[],
): Promise<void> {
  console.log('📦 Seeding appointments...');

  // HQ: secretary books with senior pastor
  const secretary = profiles['secretary'];
  const seniorPastor = profiles['senior_pastor'];
  if (secretary && seniorPastor) {
    const existing = await prisma.appointment.findFirst({
      where: { church_id: churchId, title: 'Pastoral counselling — HQ' },
    });
    if (!existing) {
      await prisma.appointment.create({
        data: {
          church_id: churchId,
          branch_id: hqBranchId,
          pastor_id: seniorPastor,
          person_id: secretary,
          title: 'Pastoral counselling — HQ',
          scheduled_at: new Date('2026-09-15T10:30:00Z'),
          location: 'HQ Pastor Study',
          notes: 'Quarterly check-in meeting.',
          status: 'confirmed',
        },
      });
    }
  }

  // Lekki: branch secretary books with branch pastor
  const branchSecretary = profiles['branch_secretary'];
  const branchPastor = profiles['branch_pastor'];
  if (branchSecretary && branchPastor) {
    const existing = await prisma.appointment.findFirst({
      where: { church_id: churchId, title: 'Lekki staff meeting' },
    });
    if (!existing) {
      await prisma.appointment.create({
        data: {
          church_id: churchId,
          branch_id: hqBranchId,
          pastor_id: branchPastor,
          person_id: branchSecretary,
          title: 'Lekki staff meeting',
          scheduled_at: new Date('2026-09-18T14:00:00Z'),
          location: 'Lekki Campus Boardroom',
          status: 'pending',
        },
      });
    }
  }

  // Visitor-Who appointment
  if (secretary && seniorPastor && visitors[0]) {
    const existing = await prisma.appointment.findFirst({
      where: { church_id: churchId, title: 'First-time visitor follow-up' },
    });
    if (!existing) {
      await prisma.appointment.create({
        data: {
          church_id: churchId,
          branch_id: hqBranchId,
          pastor_id: seniorPastor,
          person_id: secretary,
          visitor_id: visitors[0].id,
          title: 'First-time visitor follow-up',
          scheduled_at: new Date('2026-09-20T12:00:00Z'),
          location: 'HQ Lounge',
          status: 'completed',
        },
      });
    }
  }

  console.log('  🎉 Appointments written');
}
