import { ForbiddenException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_CAPACITIES, planFeatures, PlanFeature } from './plans';

export async function churchEntitlements(prisma: PrismaService, churchId: string) {
  const subscription = await prisma.platformSubscription.findUnique({
    where: { church_id: churchId },
  });
  const plan = subscription?.plan ?? 'essentials';
  const agreement = subscription?.enterprise_limits as Record<string, unknown> | null;
  const enterpriseLimit = (key: string) =>
    Number.isSafeInteger(agreement?.[key]) && Number(agreement?.[key]) >= 0
      ? Number(agreement?.[key])
      : 0;
  const limits =
    plan === 'enterprise'
      ? {
          members: enterpriseLimit('members'),
          staff: enterpriseLimit('staff'),
          locations: enterpriseLimit('locations'),
        }
      : PLAN_CAPACITIES[plan];
  return {
    subscription,
    plan,
    limits,
    features: planFeatures(plan),
    active: !!(subscription?.paid_until && subscription.paid_until > new Date()),
  };
}
export async function assertPlanFeature(
  prisma: PrismaService,
  churchId: string,
  feature: PlanFeature,
) {
  const entitlement = await churchEntitlements(prisma, churchId);
  if (!entitlement.active || !entitlement.features.includes(feature))
    throw new ForbiddenException({
      code: 'PLAN_FEATURE_REQUIRED',
      message:
        'This feature is not available on your church subscription. Contact your church administrator.',
      details: { feature },
    });
}
export async function reserveStaffSeat(prisma: PrismaService, churchId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM churches WHERE id=${churchId} FOR UPDATE`;
    await tx.staffInvitationReservation.deleteMany({
      where: { church_id: churchId, expires_at: { lte: new Date() } },
    });
    if (
      await tx.staffInvitationReservation.findUnique({
        where: { church_id_email: { church_id: churchId, email: normalized } },
      })
    )
      throw new ConflictException(
        'An invitation for this email is already being prepared. Please retry shortly.',
      );
    return tx.staffInvitationReservation.create({
      data: {
        id: randomUUID(),
        church_id: churchId,
        email: normalized,
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
  });
}
export async function releaseStaffSeat(prisma: PrismaService, id: string) {
  await prisma.staffInvitationReservation.deleteMany({ where: { id } });
}
