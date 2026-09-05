/**
 * @file giving.seed.ts
 * @description Seeds transactions (both branches, all categories, varied
 * statuses/types/gateways) and recurring giving for the full test environment.
 */

import { PrismaClient, TransactionType, TransactionStatus, PaymentGateway } from '@prisma/client';

export interface GivingSeedResult {
  transactionCount: number;
  recurringCount: number;
}

// [memberIdx, branch, categoryName, amount, type, status, gateway, method, linkService?, linkEvent?]
const TX_DEFS: Array<
  [
    number,
    string,
    string,
    number,
    TransactionType,
    TransactionStatus,
    PaymentGateway,
    string,
    boolean?,
    boolean?,
  ]
> = [
  [0, 'hq', 'Tithe', 25000, 'digital', 'success', 'paystack', 'card', true, false],
  [1, 'hq', 'Offering', 12000, 'cash', 'success', 'manual', 'cash', true, false],
  [2, 'hq', 'Seed', 45000, 'digital', 'success', 'paystack', 'card', false, false],
  [
    3,
    'hq',
    'First Fruit',
    100000,
    'bank_transfer',
    'success',
    'flutterwave',
    'bank_transfer',
    false,
    false,
  ],
  [4, 'hq', 'Thanksgiving', 35000, 'digital', 'success', 'paystack', 'card', false, false],
  [5, 'hq', 'Building Project', 75000, 'digital', 'success', 'paystack', 'card', false, false],
  [6, 'hq', 'Welfare/Mission', 15000, 'cash', 'success', 'manual', 'cash', false, false],
  [7, 'hq', 'Gift', 5000, 'digital', 'failed', 'paystack', 'card', false, false],
  [
    8,
    'hq',
    'Venison',
    20000,
    'bank_transfer',
    'pending',
    'flutterwave',
    'bank_transfer',
    false,
    false,
  ],
  [9, 'hq', 'Overall Total', 60000, 'cash', 'success', 'manual', 'cash', false, true],
  [10, 'hq', 'Tithe', 18000, 'digital', 'success', 'paystack', 'card', false, false],
  [14, 'lekki', 'Tithe', 22000, 'digital', 'success', 'paystack', 'card', true, false],
  [15, 'lekki', 'Offering', 9000, 'cash', 'success', 'manual', 'cash', true, false],
  [16, 'lekki', 'Seed', 30000, 'digital', 'success', 'paystack', 'card', false, false],
  [17, 'lekki', 'Thanksgiving', 14000, 'digital', 'reversed', 'flutterwave', 'card', false, false],
  [18, 'lekki', 'Gift', 8000, 'cash', 'success', 'manual', 'cash', false, false],
  [20, 'lekki', 'Building Project', 40000, 'digital', 'success', 'paystack', 'card', false, false],
];

// [memberIdx, categoryName, amount, frequency]
const RECURRING_DEFS: Array<[number, string, number, string]> = [
  [0, 'Tithe', 25000, 'monthly'],
  [2, 'Tithe', 45000, 'weekly'],
  [5, 'Offering', 15000, 'monthly'],
  [15, 'Tithe', 22000, 'monthly'],
];

export async function seedGiving(
  prisma: PrismaClient,
  churchId: string,
  hqBranchId: string,
  lekkiBranchId: string,
  members: { id: string; first_name: string }[],
): Promise<GivingSeedResult> {
  console.log('📦 Seeding giving transactions + recurring giving...');

  const branchIdFor = (b: 'hq' | 'lekki'): string => (b === 'hq' ? hqBranchId : lekkiBranchId);
  const categories = await prisma.givingCategory.findMany({
    where: { church_id: churchId },
  });
  const catByName = new Map(categories.map((c) => [c.name, c.id]));
  const services = await prisma.service.findMany({
    where: { church_id: churchId },
  });
  const events = await prisma.event.findMany({
    where: { church_id: churchId },
  });

  const existingCount = await prisma.transaction.count({
    where: { church_id: churchId },
  });
  if (existingCount > 0) {
    console.log(`  ⏭️  ${existingCount} transactions already exist, skipping`);
    return {
      transactionCount: existingCount,
      recurringCount: await prisma.recurringGiving.count({
        where: { church_id: churchId },
      }),
    };
  }

  let txCount = 0;
  for (const t of TX_DEFS) {
    const memberIndex = t[0];
    const branch = t[1] as 'hq' | 'lekki';
    const catName = t[2];
    const amount = t[3];
    const type = t[4];
    const status = t[5];
    const gateway = t[6];
    const method = t[7];
    const linkService = t[8];
    const linkEvent = t[9];
    const member = members[memberIndex];
    if (!member) continue;
    const catId = catByName.get(catName);
    if (!catId) continue;
    const serviceId = linkService && services[0] ? services[0].id : undefined;
    const eventId = linkEvent && events[0] ? events[0].id : undefined;
    await prisma.transaction.create({
      data: {
        church_id: churchId,
        branch_id: branchIdFor(branch),
        member_id: member.id,
        category_id: catId,
        service_id: serviceId,
        event_id: eventId,
        amount,
        currency: 'NGN',
        type,
        status,
        payment_reference: 'GIV' + Date.now() + '_' + txCount,
        payment_gateway: gateway,
        payment_method: method,
        receipt_number:
          'GCC/' + branch.toUpperCase() + '/2026/' + String(txCount + 1).padStart(4, '0'),
        notes: 'Seeded transaction (full test env)',
      },
    });
    txCount++;
    console.log(
      `  ✅ Transaction: ${member.first_name} gave ₦${amount.toLocaleString()} (${catName}, ${branch.toUpperCase()}, ${status})`,
    );
  }

  let recCount = 0;
  for (const r of RECURRING_DEFS) {
    const memberIndex = r[0];
    const catName = r[1];
    const amount = r[2];
    const frequency = r[3];
    const member = members[memberIndex];
    const catId = catByName.get(catName);
    if (!member || !catId) continue;
    const existing = await prisma.recurringGiving.findFirst({
      where: {
        church_id: churchId,
        member_id: member.id,
        category_id: catId,
      },
    });
    if (existing) {
      recCount++;
      continue;
    }
    await prisma.recurringGiving.create({
      data: {
        church_id: churchId,
        member_id: member.id,
        category_id: catId,
        amount,
        currency: 'NGN',
        frequency,
        is_active: true,
        next_charge_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        last_charge_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });
    recCount++;
    console.log(
      `  ✅ Recurring: ${member.first_name} ${frequency} ₦${amount.toLocaleString()} (${catName})`,
    );
  }

  console.log(`  🎉 Transactions: ${txCount}, recurring giving: ${recCount}`);
  return { transactionCount: txCount, recurringCount: recCount };
}
