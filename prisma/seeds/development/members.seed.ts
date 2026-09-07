/**
 * @file members.seed.ts
 * @description Seeds sample church members with realistic Nigerian names.
 * Idempotent — skips members that already exist (matched by email).
 */

import { PrismaClient, MemberStatus } from '@prisma/client';

export interface MemberSeedResult {
  members: { id: string; first_name: string; last_name: string }[];
  memberCount: number;
  firstMemberPhone: string | null;
}

const MEMBERS = [
  {
    first_name: 'Adebayo',
    last_name: 'Ogundimu',
    email: 'adebayo.ogundimu@gmail.com',
    phone: '+234 803 456 7890',
    gender: 'male',
    date_of_birth: new Date('1985-03-15'),
  },
  {
    first_name: 'Chioma',
    last_name: 'Nwosu',
    email: 'chioma.nwosu@gmail.com',
    phone: '+234 805 678 9012',
    gender: 'female',
    date_of_birth: new Date('1990-07-22'),
  },
  {
    first_name: 'Emeka',
    last_name: 'Okonkwo',
    email: 'emeka.okonkwo@outlook.com',
    phone: '+234 807 890 1234',
    gender: 'male',
    date_of_birth: new Date('1988-11-08'),
  },
  {
    first_name: 'Fatima',
    last_name: 'Abdullahi',
    email: 'fatima.abdullahi@yahoo.com',
    phone: '+234 809 012 3456',
    gender: 'female',
    date_of_birth: new Date('1992-04-30'),
  },
  {
    first_name: 'Olumide',
    last_name: 'Adeyemi',
    email: 'olumide.adeyemi@gmail.com',
    phone: '+234 811 234 5678',
    gender: 'male',
    date_of_birth: new Date('1978-09-12'),
  },
  {
    first_name: 'Ngozi',
    last_name: 'Eze',
    email: 'ngozi.eze@gmail.com',
    phone: '+234 813 456 7890',
    gender: 'female',
    date_of_birth: new Date('1995-01-25'),
  },
  {
    first_name: 'Tunde',
    last_name: 'Bakare',
    email: 'tunde.bakare@outlook.com',
    phone: '+234 815 678 9012',
    gender: 'male',
    date_of_birth: new Date('1982-06-18'),
  },
  {
    first_name: 'Aisha',
    last_name: 'Mohammed',
    email: 'aisha.mohammed@gmail.com',
    phone: '+234 817 890 1234',
    gender: 'female',
    date_of_birth: new Date('1993-12-03'),
  },
  {
    first_name: 'Kunle',
    last_name: 'Fashola',
    email: 'kunle.fashola@yahoo.com',
    phone: '+234 819 012 3456',
    gender: 'male',
    date_of_birth: new Date('1987-08-27'),
  },
  {
    first_name: 'Blessing',
    last_name: 'Effiong',
    email: 'blessing.effiong@gmail.com',
    phone: '+234 821 234 5678',
    gender: 'female',
    date_of_birth: new Date('1998-02-14'),
  },
];

export async function seedMembers(
  prisma: PrismaClient,
  churchId: string,
  branchId: string,
): Promise<MemberSeedResult> {
  console.log('📦 Seeding members...');

  const emails = MEMBERS.map((m) => m.email);
  const existing = await prisma.member.findMany({
    where: { church_id: churchId, email: { in: emails } },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((m) => m.email));

  const missing = MEMBERS.filter((m) => !existingEmails.has(m.email));
  if (missing.length > 0) {
    // Pre-filtered to only missing members (no unique constraint on email), so
    // no skipDuplicates needed — but it is still a single batched insert.
    await prisma.member.createMany({
      data: missing.map((m) => ({
        church_id: churchId,
        branch_id: branchId,
        first_name: m.first_name,
        last_name: m.last_name,
        email: m.email,
        phone: m.phone,
        whatsapp_number: m.phone,
        gender: m.gender,
        date_of_birth: m.date_of_birth,
        status: MemberStatus.active,
        member_since: new Date(2024, MEMBERS.indexOf(m) % 12, 1),
      })),
    });
  }

  const rows = await prisma.member.findMany({
    where: { church_id: churchId, email: { in: emails } },
    select: { id: true, first_name: true, last_name: true, email: true },
  });
  const rowsByEmail = new Map(rows.map((r) => [r.email, r]));

  const members: { id: string; first_name: string; last_name: string }[] = MEMBERS.map((m) => {
    const row = rowsByEmail.get(m.email);
    if (!row) {
      throw new Error(`Member "${m.email}" missing after seed`);
    }
    return { id: row.id, first_name: row.first_name, last_name: row.last_name };
  });

  for (const member of members) {
    console.log(`  ✅ Member: ${member.first_name} ${member.last_name}`);
  }

  return { members, memberCount: members.length, firstMemberPhone: MEMBERS[0]?.phone ?? null };
}
