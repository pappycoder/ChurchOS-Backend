/**
 * @file transactions.seed.ts
 * @description Seeds sample giving transactions.
 * Idempotent — skips if transactions already exist for the church.
 */

import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';

export interface TransactionSeedResult {
  transactionCount: number;
}

export async function seedTransactions(
  prisma: PrismaClient,
  churchId: string,
  branchId: string,
  members: { id: string; first_name: string }[],
): Promise<TransactionSeedResult> {
  console.log('📦 Seeding sample transactions...');

  const existingCount = await prisma.transaction.count({ where: { church_id: churchId } });
  if (existingCount > 0) {
    console.log(`  ⏭️  ${existingCount} transactions already exist, skipping`);
    return { transactionCount: existingCount };
  }

  const titheCategory = await prisma.givingCategory.findFirst({
    where: { church_id: churchId, name: 'Tithe' },
  });

  if (!titheCategory || members.length === 0) {
    console.log('  ⚠️  No tithe category or members found, skipping transactions');
    return { transactionCount: 0 };
  }

  let count = 0;
  for (let i = 0; i < Math.min(3, members.length); i++) {
    const member = members[i];
    const amount = Math.floor(Math.random() * 50000) + 10000;

    await prisma.transaction.create({
      data: {
        church_id: churchId,
        branch_id: branchId,
        member_id: member.id,
        category_id: titheCategory.id,
        amount,
        currency: 'NGN',
        type: TransactionType.digital,
        status: TransactionStatus.success,
        payment_reference: `TITHSEED${Date.now()}${i}`,
        payment_method: 'card',
        payment_gateway: 'paystack',
        receipt_number: `GCC/TIT/2026/${String(i + 1).padStart(4, '0')}`,
      },
    });
    count++;
    console.log(`  ✅ Transaction: ${member.first_name} gave ₦${amount.toLocaleString()} (Tithe)`);
  }

  return { transactionCount: count };
}
