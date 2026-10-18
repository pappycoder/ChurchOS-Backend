import { SubscriptionPlan, BillingCycle } from '@prisma/client';
export { SubscriptionPlan, BillingCycle };
/** Server-owned NGN pricing. Enterprise requires an agreed quote. */
export const SUBSCRIPTION_PLANS = {
  essentials: { name: 'Essentials', monthly: 10000, annual: 108000 },
  community: { name: 'Community', monthly: 20000, annual: 216000 },
  network: { name: 'Network', monthly: 40000, annual: 432000 },
} as const satisfies Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  { name: string; monthly: number; annual: number }
>;
/** Calendar periods clamp month-end instead of rolling into the next month. */
export function subscriptionEnd(start: Date, cycle: BillingCycle): Date {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (cycle === 'annual' ? 12 : 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}
