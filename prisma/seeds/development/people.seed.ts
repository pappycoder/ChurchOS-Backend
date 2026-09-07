/**
 * @file people.seed.ts
 * @description Seeds additional members (both branches, varied statuses),
 * families, and visitors for the full test environment.
 *
 * Base 10 members come from the existing `members.seed.ts` (HQ). This
 * module adds 14 more (HQ + Lekki), creates families over the combined
 * member list, and seeds visitors (follow-up assignment happens later,
 * once profiles exist — see `assignVisitorFollowUp`).
 */

import { PrismaClient, MemberStatus } from '@prisma/client';

export interface PersonSeedResult {
  members: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  }[];
  familyCount: number;
  visitors: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  }[];
}

// [first, last, email, phone, gender, dob, branch, status?, city?]
const EXTRA_MEMBERS: Array<
  [
    string,
    string,
    string,
    string,
    'male' | 'female',
    string,
    'hq' | 'lekki',
    MemberStatus?,
    string?,
  ]
> = [
  [
    'Chinedu',
    'Okafor',
    'chinedu.okafor@gmail.com',
    '+234 803 111 2222',
    'male',
    '1990-05-10',
    'hq',
    undefined,
    'Ikeja',
  ],
  [
    'Adaeze',
    'Nwosu',
    'adaeze.nwosu@outlook.com',
    '+234 805 333 4444',
    'female',
    '1994-09-23',
    'hq',
    undefined,
    'Ikeja',
  ],
  [
    'Ibrahim',
    'Suleiman',
    'ibrahim.suleiman@yahoo.com',
    '+234 807 555 6666',
    'male',
    '1986-01-30',
    'hq',
    undefined,
    'Lagos',
  ],
  [
    'Folake',
    'Ogunleye',
    'folake.ogunleye@gmail.com',
    '+234 809 777 8888',
    'female',
    '1997-12-14',
    'hq',
    undefined,
    'Lagos',
  ],
  [
    'Obinna',
    'Eze',
    'obinna.eze@gmail.com',
    '+234 811 999 0000',
    'male',
    '1983-07-19',
    'lekki',
    undefined,
    'Lekki',
  ],
  [
    'Yemi',
    'Afolabi',
    'yemi.afolabi@outlook.com',
    '+234 813 222 1111',
    'male',
    '1991-03-05',
    'lekki',
    undefined,
    'Lekki',
  ],
  [
    'Kemi',
    'Adepoju',
    'kemi.adepoju@gmail.com',
    '+234 815 444 3333',
    'female',
    '1995-06-28',
    'lekki',
    undefined,
    'Lekki',
  ],
  [
    'Segun',
    'Adebayo',
    'segun.adebayo@yahoo.com',
    '+234 817 666 5555',
    'male',
    '1988-10-08',
    'lekki',
    undefined,
    'Lekki',
  ],
  [
    'Halima',
    'Bello',
    'halima.bello@gmail.com',
    '+234 819 888 7777',
    'female',
    '1992-02-17',
    'lekki',
    undefined,
    'Lekki',
  ],
  [
    'Uche',
    'Obi',
    'uche.obi@gmail.com',
    '+234 821 000 9999',
    'male',
    '1985-11-11',
    'hq',
    MemberStatus.inactive,
    'Ikeja',
  ],
  [
    'Zainab',
    'Lawal',
    'zainab.lawal@gmail.com',
    '+234 823 2222 1111',
    'female',
    '1996-04-22',
    'lekki',
    MemberStatus.suspended,
    'Lekki',
  ],
  [
    'Peter',
    'Ukaegbu',
    'peter.ukaegbu@outlook.com',
    '+234 825 444 3333',
    'male',
    '1979-08-09',
    'hq',
    MemberStatus.transferred,
    'Lagos',
  ],
  [
    'Ijeoma',
    'Okafor',
    'ijeoma.okafor@yahoo.com',
    '+234 827 666 5555',
    'female',
    '1993-01-31',
    'lekki',
    undefined,
    'Lekki',
  ],
  [
    'Tobi',
    'Oladipo',
    'tobi.oladipo@gmail.com',
    '+234 701 888 7777',
    'male',
    '2000-07-07',
    'hq',
    undefined,
    'Ikeja',
  ],
];

// [name, headIdx, [memberIdx, relationship][]]
const FAMILY_DEFS: Array<[string, number, Array<[number, string]>]> = [
  [
    'Ogundimu Family',
    0,
    [
      [0, 'head'],
      [1, 'spouse'],
    ],
  ],
  [
    'Okonkwo Family',
    2,
    [
      [2, 'head'],
      [5, 'spouse'],
    ],
  ],
  ['Adeyemi Family', 4, [[4, 'head']]],
  [
    'Eze Family',
    15,
    [
      [15, 'head'],
      [12, 'spouse'],
    ],
  ],
  [
    'Afolabi Family',
    16,
    [
      [16, 'head'],
      [17, 'spouse'],
    ],
  ],
];

// [first, last, email, phone, gender, followUpStatus, branch, convertedMemberIdx?]
const VISITOR_DEFS: Array<
  [string, string, string, string, 'male' | 'female', string, 'hq' | 'lekki', number?]
> = [
  ['Chidera', 'Umeh', 'chidera.umeh@gmail.com', '+234 803 444 1111', 'female', 'contacted', 'hq'],
  ['Musa', 'Garba', 'musa.garba@outlook.com', '+234 805 222 3333', 'male', 'interested', 'hq'],
  [
    'Amara',
    'Okeke',
    'amara.okeke@gmail.com',
    '+234 807 111 5555',
    'female',
    'follow_up_scheduled',
    'lekki',
  ],
  [
    'Damilare',
    'Ogundare',
    'damilare.ogundare@yahoo.com',
    '+234 809 555 2222',
    'male',
    'converted',
    'hq',
    23,
  ],
];

export async function seedPeople(
  prisma: PrismaClient,
  churchId: string,
  hqBranchId: string,
  lekkiBranchId: string,
  baseMembers: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  }[],
): Promise<PersonSeedResult> {
  console.log('📦 Seeding people (members, families, visitors)...');

  const branchIdFor = (branch: 'hq' | 'lekki'): string =>
    branch === 'hq' ? hqBranchId : lekkiBranchId;

  // Start with the existing base members.
  const members = [...baseMembers];

  // ---------------------------------------------------------------------------
  // Extra members
  // ---------------------------------------------------------------------------

  for (const memberData of EXTRA_MEMBERS) {
    const [first, last, email, phone, gender, dob, branch, status, city] = memberData;

    const existing = await prisma.member.findFirst({
      where: {
        church_id: churchId,
        email,
      },
    });

    if (existing) {
      members.push({
        id: existing.id,
        first_name: existing.first_name,
        last_name: existing.last_name,
        phone: existing.phone,
      });

      continue;
    }

    const created = await prisma.member.create({
      data: {
        church_id: churchId,
        branch_id: branchIdFor(branch),
        first_name: first,
        last_name: last,
        email,
        phone,
        whatsapp_number: phone,
        gender,
        date_of_birth: new Date(dob),
        status: status ?? MemberStatus.active,
        city,
        state: 'Lagos',
        member_since: new Date(2024, members.length % 12, 1),
      },
    });

    members.push({
      id: created.id,
      first_name: created.first_name,
      last_name: created.last_name,
      phone: created.phone,
    });

    console.log(
      `  ✅ Member: ${created.first_name} ${created.last_name} (${branch.toUpperCase()}${
        status ? `, ${status}` : ''
      })`,
    );
  }

  // ---------------------------------------------------------------------------
  // Families
  // ---------------------------------------------------------------------------

  let familyCount = 0;

  for (const familyDefinition of FAMILY_DEFS) {
    const [name, headIdx, memberDefs] = familyDefinition;

    if (headIdx >= members.length) {
      continue;
    }

    const existing = await prisma.family.findFirst({
      where: {
        church_id: churchId,
        name,
      },
    });

    if (existing) {
      familyCount++;
      continue;
    }

    const family = await prisma.family.create({
      data: {
        church_id: churchId,
        name,
        head_id: members[headIdx].id,
      },
    });

    for (const [memberIndex, relationship] of memberDefs) {
      if (memberIndex >= members.length) {
        continue;
      }

      await prisma.familyMember.create({
        data: {
          family_id: family.id,
          member_id: members[memberIndex].id,
          relationship,
          is_head: relationship === 'head',
        },
      });
    }

    familyCount++;

    console.log(`  ✅ Family: ${family.name} (${memberDefs.length} members)`);
  }

  // ---------------------------------------------------------------------------
  // Visitors
  // ---------------------------------------------------------------------------

  const visitors: PersonSeedResult['visitors'] = [];

  for (const visitorData of VISITOR_DEFS) {
    const [first, last, email, phone, gender, followUp, branch, convertedIdx] = visitorData;

    const existing = await prisma.visitor.findFirst({
      where: {
        church_id: churchId,
        email,
      },
    });

    if (existing) {
      visitors.push({
        id: existing.id,
        first_name: existing.first_name,
        last_name: existing.last_name ?? '',
        email: existing.email,
      });

      continue;
    }

    const data: {
      church_id: string;
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      whatsapp_number: string;
      gender: 'male' | 'female';
      follow_up_status: string;
      notes: string;
      converted_member_id?: string;
      converted_at?: Date;
      deleted_at?: Date;
    } = {
      church_id: churchId,
      first_name: first,
      last_name: last,
      email,
      phone,
      whatsapp_number: phone,
      gender,
      follow_up_status: followUp,
      notes: 'Seeded visitor for full-test environment',
    };

    if (convertedIdx !== undefined && members[convertedIdx]) {
      data.converted_member_id = members[convertedIdx].id;
      data.converted_at = new Date();
      data.deleted_at = new Date();

      // Soft-delete the visitor after conversion.
      data.follow_up_status = 'converted';
    }

    const created = await prisma.visitor.create({
      data,
    });

    visitors.push({
      id: created.id,
      first_name: created.first_name,
      last_name: created.last_name ?? '',
      email: created.email,
    });

    console.log(
      `  ✅ Visitor: ${created.first_name} ${
        created.last_name ?? ''
      } (${followUp}, ${branch.toUpperCase()})`,
    );
  }

  console.log(
    `  🎉 Members: ${members.length}, families: ${familyCount}, visitors: ${visitors.length}`,
  );

  return {
    members,
    familyCount,
    visitors,
  };
}

/**
 * Links follow-up assignments (visitor.assigned_to_id → Profile.id)
 * once profiles exist.
 */
export async function assignVisitorFollowUp(
  prisma: PrismaClient,
  visitors: PersonSeedResult['visitors'],
  profilesByKey: Record<string, string>,
): Promise<void> {
  const byEmail = new Map(
    visitors
      .filter((visitor) => visitor.email)
      .map((visitor) => [visitor.email!.toLowerCase(), visitor.id]),
  );

  const assignments: {
    email: string;
    profileKey: string;
  }[] = [
    {
      email: 'chidera.umeh@gmail.com',
      profileKey: 'secretary',
    },
    {
      email: 'amara.okeke@gmail.com',
      profileKey: 'branch_secretary',
    },
  ];

  for (const assignment of assignments) {
    const visitorId = byEmail.get(assignment.email.toLowerCase());

    const profileId = profilesByKey[assignment.profileKey];

    if (!visitorId || !profileId) {
      continue;
    }

    await prisma.visitor.update({
      where: {
        id: visitorId,
      },
      data: {
        assigned_to_id: profileId,
      },
    });

    console.log(`  ✅ Visitor assigned: ${assignment.email} → ${assignment.profileKey} profile`);
  }
}
