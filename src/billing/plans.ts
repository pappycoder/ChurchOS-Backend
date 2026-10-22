import { SubscriptionPlan, BillingCycle } from '@prisma/client';
export { SubscriptionPlan, BillingCycle };
/** Server-owned USD base pricing. Enterprise requires an agreed quote. */
export const SUBSCRIPTION_PLANS = {
  essentials: { name: 'Essentials', monthly: 10, annual: 108 },
  community: { name: 'Community', monthly: 20, annual: 216 },
  network: { name: 'Network', monthly: 40, annual: 432 },
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

export const PLAN_RANK = { essentials: 0, community: 1, network: 2, enterprise: 3 } as const;
export const PLAN_CAPACITIES = {
  essentials: { members: 100, staff: 2, locations: 1 },
  community: { members: 300, staff: 5, locations: 1 },
  network: { members: 1500, staff: 15, locations: 3 },
} as const;
export const FEATURE_LEVELS = {
  giving: 1,
  events: 1,
  groups: 1,
  forms: 1,
  reports: 1,
  email: 1,
  media: 1,
  tickets: 2,
  pastoral: 2,
  assets: 2,
  analytics: 2,
  sms: 2,
  whatsapp: 2,
  calls: 2,
  webhooks: 2,
} as const;
export type PlanFeature = keyof typeof FEATURE_LEVELS;
export function planFeatures(plan: SubscriptionPlan): PlanFeature[] {
  return (Object.keys(FEATURE_LEVELS) as PlanFeature[]).filter(
    (f) => FEATURE_LEVELS[f] <= PLAN_RANK[plan],
  );
}
