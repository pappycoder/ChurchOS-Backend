import { PrismaService } from '../../src/prisma/prisma.service';

/** Explicit entitlements for workflow fixtures that exercise multiple locations/staff.
 * Plan-boundary suites must continue to construct their own subscriptions.
 */
export async function seedWorkflowSubscription(prisma: PrismaService, churchId: string) {
  await prisma.platformSubscription.create({
    data: {
      church_id: churchId,
      plan: 'network',
      cycle: 'monthly',
      paid_until: new Date(Date.now() + 7 * 86400000),
    },
  });
}
