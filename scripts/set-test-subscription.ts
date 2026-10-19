import 'dotenv/config';
import { parseArgs } from 'node:util';
import { Prisma, PrismaClient, SubscriptionPlan, BillingCycle } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { subscriptionEnd } from '../src/billing/plans';

export const HELP = `Manually set ONE church subscription for testing (no payment is created).

Usage: npm run subscription:test -- [options]
  --list                    Show active churches, IDs and current subscriptions
  --church <id>             Exact church ID from --list
  --plan <plan>             essentials | community | network | enterprise
  --cycle <cycle>           monthly (default) | annual
  --days <number>           Active duration; default is one calendar billing cycle
  --expired                 Set expiry to yesterday instead (cannot combine with --days)
  --members <number>        Enterprise member limit (required for enterprise)
  --staff <number>          Enterprise staff limit (required for enterprise)
  --locations <number>      Enterprise location limit (required for enterprise)
  --dry-run                 Preview without writing
  --help                    Show this help without connecting to the database

Uses DATABASE_URL from the environment or backend .env. Changes take effect immediately.
Scheduled plan changes are cleared. Existing people, roles and payment records are preserved.
`;

export function parseOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      list: { type: 'boolean' },
      church: { type: 'string' },
      plan: { type: 'string' },
      cycle: { type: 'string' },
      days: { type: 'string' },
      expired: { type: 'boolean' },
      members: { type: 'string' },
      staff: { type: 'string' },
      locations: { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help || args.length === 0) return { mode: 'help' as const };
  if (values.list) {
    if (Object.keys(values).length !== 1) throw new Error('--list must be used alone.');
    return { mode: 'list' as const };
  }
  if (!values.church?.trim())
    throw new Error('Provide an exact --church ID; use --list to find it.');
  const plan = values.plan as SubscriptionPlan;
  if (!Object.values(SubscriptionPlan).includes(plan)) throw new Error('Provide a valid --plan.');
  const cycle = (values.cycle ?? 'monthly') as BillingCycle;
  if (!Object.values(BillingCycle).includes(cycle)) throw new Error('Invalid --cycle.');
  if (values.expired && values.days !== undefined) {
    throw new Error('--expired and --days cannot be combined.');
  }
  const integer = (value: string | undefined, name: string, min: number, max: number) => {
    if (value === undefined || !/^\d+$/.test(value)) throw new Error(`Invalid --${name}.`);
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < min || result > max) {
      throw new Error(`--${name} must be an integer between ${min} and ${max}.`);
    }
    return result;
  };
  const days = values.days === undefined ? undefined : integer(values.days, 'days', 1, 36500);
  let limits: { members: number; staff: number; locations: number } | undefined;
  if (plan === 'enterprise') {
    limits = {
      members: integer(values.members, 'members', 0, 2147483647),
      staff: integer(values.staff, 'staff', 0, 2147483647),
      locations: integer(values.locations, 'locations', 0, 2147483647),
    };
  } else if ([values.members, values.staff, values.locations].some((v) => v !== undefined)) {
    throw new Error('Custom limits can only be used with --plan enterprise.');
  }
  return {
    mode: 'set' as const,
    churchId: values.church.trim(),
    plan,
    cycle,
    days,
    expired: values.expired ?? false,
    dryRun: values['dry-run'] ?? false,
    limits,
  };
}

type SetOptions = Extract<ReturnType<typeof parseOptions>, { mode: 'set' }>;

export function subscriptionData(options: SetOptions, now: Date) {
  const periodStart = options.expired ? new Date(now.getTime() - 32 * 86400000) : now;
  const expiry = options.expired
    ? new Date(now.getTime() - 86400000)
    : options.days === undefined
      ? subscriptionEnd(now, options.cycle)
      : new Date(now.getTime() + options.days * 86400000);
  return {
    plan: options.plan,
    cycle: options.cycle,
    period_started_at: periodStart,
    paid_until: expiry,
    scheduled_plan: null,
    scheduled_cycle: null,
    enterprise_limits: options.limits ?? Prisma.DbNull,
  };
}

export async function setTestSubscription(prisma: PrismaClient, options: SetOptions) {
  return prisma.$transaction(async (tx) => {
    // Same church lock used by billing/quota writers; never modify another tenant.
    await tx.$queryRaw`SELECT id FROM churches WHERE id = ${options.churchId} FOR UPDATE`;
    const church = await tx.church.findFirst({
      where: { id: options.churchId, archived_at: null },
      select: { id: true, name: true, subscription: true },
    });
    if (!church) throw new Error('Active church not found. Use --list for valid IDs.');
    const data = subscriptionData(options, new Date());
    const pendingPayments = await tx.subscriptionPayment.count({
      where: { church_id: church.id, status: 'pending' },
    });
    if (!options.dryRun) {
      await tx.platformSubscription.upsert({
        where: { church_id: church.id },
        create: { church_id: church.id, ...data },
        update: data,
      });
    }
    return {
      church: church.name,
      churchId: church.id,
      before: church.subscription,
      after: data,
      pendingPayments,
    };
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.mode === 'help') {
    console.log(HELP);
    return;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const target = new URL(connectionString);
  console.log(`Database: ${target.hostname}${target.pathname}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (options.mode === 'list') {
      const churches = await prisma.church.findMany({
        where: { archived_at: null },
        select: { id: true, name: true, subscription: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      console.table(
        churches.map((c) => ({
          id: c.id,
          name: c.name,
          plan: c.subscription?.plan ?? 'none',
          cycle: c.subscription?.cycle ?? '-',
          paid_until: c.subscription?.paid_until?.toISOString() ?? 'unpaid',
        })),
      );
      return;
    }
    const result = await setTestSubscription(prisma, options);
    console.log(options.dryRun ? 'Preview only; nothing changed.' : 'Test subscription updated.');
    console.log(JSON.stringify(result, null, 2));
    if (result.pendingPayments) {
      console.log(
        'Pending checkouts remain unchanged. Subsequent payment verification may change this subscription.',
      );
    }
    console.log(
      'Refresh the app/session to reload plan features. No payment records were created.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Subscription update failed.');
    process.exitCode = 1;
  });
}
