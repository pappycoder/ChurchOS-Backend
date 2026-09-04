/**
 * @file events.seed.ts
 * @description Seeds events (HQ + Lekki), ticket tiers, registrations, and
 * tickets in varied states for the full test environment.
 */

import {
  Prisma,
  PrismaClient,
  EventType,
  TicketStatus,
  RegistrationPaymentStatus,
} from '@prisma/client';

export interface EventSeedResult {
  eventCount: number;
  ticketCount: number;
}

// [title, branch, type, startDate, endDate, location, capacity, price, isFree]
const EVENT_DEFS: Array<
  [string, 'hq' | 'lekki', EventType, string, string, string, number?, number?, boolean?]
> = [
  [
    'Annual Leadership Conference',
    'hq',
    EventType.conference,
    '2026-10-15T09:00:00.000Z',
    '2026-10-17T17:00:00.000Z',
    'Grace Community Church Auditorium, Ikeja',
    800,
    undefined,
    false,
  ],
  [
    'Lekki Thanksgiving Service',
    'lekki',
    EventType.service,
    '2026-11-01T10:00:00.000Z',
    '2026-11-01T13:00:00.000Z',
    'Lekki Campus',
    300,
    undefined,
    true,
  ],
  [
    'Young Adults Retreat',
    'hq',
    EventType.training,
    '2026-12-04T08:00:00.000Z',
    '2026-12-06T16:00:00.000Z',
    'Lekki Retreat Centre',
    120,
    10000,
    false,
  ],
];

// [eventIdx, name, price, capacity?]
const TIER_DEFS: Array<[number, string, number, number?]> = [
  [0, 'Early Bird', 15000, 300],
  [0, 'Regular', 25000, 500],
  [2, 'Standard', 10000, 120],
];

// [eventIdx, memberIdx, tierIdx?, paymentStatus, quantity, checkedIn?]
const REG_DEFS: Array<
  [number, number, number | undefined, RegistrationPaymentStatus, number, boolean?]
> = [
  [0, 0, 0, RegistrationPaymentStatus.paid, 1, true],
  [0, 1, 0, RegistrationPaymentStatus.paid, 1, false],
  [0, 2, 1, RegistrationPaymentStatus.pending, 2, false],
  [0, 4, 1, RegistrationPaymentStatus.paid, 1, true],
  [1, 14, undefined, RegistrationPaymentStatus.paid, 1, false],
  [1, 15, undefined, RegistrationPaymentStatus.paid, 1, false],
  [2, 5, 0, RegistrationPaymentStatus.failed, 1, false],
];

export async function seedEvents(
  prisma: PrismaClient,
  churchId: string,
  hqBranchId: string,
  lekkiBranchId: string,
  members: {
    id: string;
    first_name: string;
  }[],
): Promise<EventSeedResult> {
  console.log('📦 Seeding events, tiers, registrations, tickets...');

  const branchIdFor = (branch: 'hq' | 'lekki'): string =>
    branch === 'hq' ? hqBranchId : lekkiBranchId;

  const events: { id: string }[] = [];
  const tiers: {
    id: string;
    eventIdx: number;
    name: string;
    price: number;
  }[] = [];

  // ── Events ─────────────────────────────────────────────────────────
  for (const eventDef of EVENT_DEFS) {
    const [title, branch, type, start, end, location, capacity, price, isFree] = eventDef;

    const existing = await prisma.event.findFirst({
      where: {
        church_id: churchId,
        title,
      },
    });

    if (existing) {
      events.push({ id: existing.id });
      console.log(`  ℹ️ Event already exists: ${existing.title}`);
      continue;
    }

    const created = await prisma.event.create({
      data: {
        church_id: churchId,
        branch_id: branchIdFor(branch),
        title,
        type,
        description: `Seeded ${title}`,
        start_date: new Date(start),
        end_date: new Date(end),
        location,
        capacity: capacity ?? undefined,
        is_free: isFree ?? false,
        price: isFree ? undefined : (price ?? undefined),
        registration_fields: ['full_name', 'email', 'phone'] as Prisma.InputJsonValue,
      },
    });

    events.push({ id: created.id });

    console.log(`  ✅ Event: ${created.title} (${branch.toUpperCase()})`);
  }

  // ── Ticket tiers ───────────────────────────────────────────────────
  for (const tierDef of TIER_DEFS) {
    const [eventIndex, name, price, capacity] = tierDef;
    const event = events[eventIndex];

    if (!event) {
      console.warn(
        `  ⚠️ Skipping tier "${name}" because event index ${eventIndex} does not exist.`,
      );
      continue;
    }

    const existing = await prisma.eventTicketTier.findFirst({
      where: {
        event_id: event.id,
        name,
      },
    });

    if (existing) {
      tiers.push({
        id: existing.id,
        eventIdx: eventIndex,
        name: existing.name,
        price: existing.price,
      });

      continue;
    }

    const created = await prisma.eventTicketTier.create({
      data: {
        event_id: event.id,
        name,
        price,
        capacity: capacity ?? undefined,
        display_order: tiers.filter((tier) => tier.eventIdx === eventIndex).length + 1,
      },
    });

    tiers.push({
      id: created.id,
      eventIdx: eventIndex,
      name: created.name,
      price: created.price,
    });

    console.log(`  ✅ Tier: ${name} (₦${price.toLocaleString()})`);
  }

  // ── Registrations + tickets ────────────────────────────────────────
  let ticketCount = 0;

  for (const registrationDef of REG_DEFS) {
    const [eventIndex, memberIndex, tierIndex, paymentStatus, quantity, checkedIn] =
      registrationDef;

    const event = events[eventIndex];
    const member = members[memberIndex];

    if (!event) {
      console.warn(`  ⚠️ Skipping registration because event index ${eventIndex} does not exist.`);
      continue;
    }

    if (!member) {
      console.warn(
        `  ⚠️ Skipping registration because member index ${memberIndex} does not exist.`,
      );
      continue;
    }

    const isCheckedIn = checkedIn ?? false;

    // Tier indexes are relative to the tiers belonging to this event.
    const eventTiers = tiers.filter((tier) => tier.eventIdx === eventIndex);

    const tier = tierIndex !== undefined ? eventTiers[tierIndex] : undefined;

    if (tierIndex !== undefined && !tier) {
      console.warn(`  ⚠️ Tier index ${tierIndex} not found for event index ${eventIndex}.`);
      continue;
    }

    // Prevent duplicate registrations.
    const existingRegistration = await prisma.eventRegistration.findFirst({
      where: {
        event_id: event.id,
        member_id: member.id,
      },
    });

    if (existingRegistration) {
      const existingTickets = await prisma.ticket.count({
        where: {
          registration_id: existingRegistration.id,
        },
      });

      ticketCount += existingTickets;

      console.log(`  ℹ️ Registration already exists: ${member.first_name} → ${event.id}`);

      continue;
    }

    const paymentReference =
      paymentStatus === RegistrationPaymentStatus.paid
        ? `EVT-${Date.now()}-${ticketCount + 1}`
        : undefined;

    const registration = await prisma.eventRegistration.create({
      data: {
        church_id: churchId,
        event_id: event.id,
        member_id: member.id,
        tier_id: tier?.id,
        quantity,
        payment_status: paymentStatus,
        payment_reference: paymentReference,
        checked_in: isCheckedIn,
        custom_data: {
          full_name: `${member.first_name} Seeded`,
          email: `${member.first_name.toLowerCase()}.seeded@churchos.dev`,
        } as Prisma.InputJsonValue,
      },
    });

    const ticketStatus =
      paymentStatus === RegistrationPaymentStatus.paid
        ? TicketStatus.paid
        : paymentStatus === RegistrationPaymentStatus.pending
          ? TicketStatus.reserved
          : TicketStatus.cancelled;

    const ticketPaymentReference =
      paymentStatus === RegistrationPaymentStatus.paid
        ? `TKT-${Date.now()}-${ticketCount + 1}`
        : undefined;

    const ticket = await prisma.ticket.create({
      data: {
        event_id: event.id,
        member_id: member.id,
        registration_id: registration.id,
        tier_name: tier?.name,
        price_paid: tier?.price,
        payment_reference: ticketPaymentReference,
        code: `TKT-${event.id
          .slice(0, 4)
          .toUpperCase()}-${String(ticketCount + 1).padStart(3, '0')}`,
        status: ticketStatus,
        is_used: isCheckedIn,
      },
    });

    if (isCheckedIn) {
      await prisma.ticket.update({
        where: {
          id: ticket.id,
        },
        data: {
          used_at: new Date(),
        },
      });
    }

    ticketCount++;

    console.log(`  ✅ Registration: ${member.first_name} → ${event.id} (${paymentStatus})`);
  }

  console.log(`  🎉 Events: ${events.length}, tiers: ${tiers.length}, tickets: ${ticketCount}`);

  return {
    eventCount: events.length,
    ticketCount,
  };
}
