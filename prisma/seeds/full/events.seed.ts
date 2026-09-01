/**
 * @file events.seed.ts
 * @description Seeds events (HQ + Lekki), ticket tiers, registrations,and
 * tickets in varied states for the full test environment.
 */

import { PrismaClient, EventType, TicketStatus, RegistrationPaymentStatus } from '@prisma/client';

export interface EventSeedResult {
  eventCount: number;
  ticketCount: number;
}

// [title, branch, type, startDate, endDate, location, capacity, price, isFree]
const EVENT_DEFS: Array<[string,'hq' | 'lekki', EventType, string, string, string, number?, number?, boolean?]> = [
  ['Annual Leadership Conference','hq','conference','2026-10-15T09:00:00.000Z','2026-10-17T17:00:00.000Z','Grace Community Church Auditorium, Ikeja',800,,false],
  ['Lekki Thanksgiving Service','lekki','service','2026-11-01T10:00:00.000Z','2026-11-01T13:00:00.000Z','Lekki Campus',300,,true],
  ['Young Adults Retreat','hq','training','2026-12-04T08:00:00.000Z','2026-12-06T16:00:00.000Z','Lekki Retreat Centre',120,,10000,,false],
];

// [eventIdx, name, price, capacity?]
const TIER_DEFS: Array<[number,'string', number, number?]> = [
  ['0','Early Bird',15000,,300],
  ['0','Regular',25000,,500],
  ['2','Standard',10000,,120],
];

// [eventIdx, memberIdx, tierIdx?, paymentStatus, quantity, checkedIn?]
const REG_DEFS: Array<[number,'number', number?, RegistrationPaymentStatus, number, boolean?]> = [
  ['0','0','0','paid',1,,true],
  ['0','1','0','paid',1,,false],
  ['0','2','1','pending',2,,false],
  ['0','4','1','paid',1,,true],
  ['1','14',,'paid',1,,false],
  ['1','15',,'paid',1,,false],
  ['2','5','2','failed',1,,false],
];

export async function seedEvents(
  prisma: PrismaClient,
  churchId: string,
  hqBranchId: string,
  lekkiBranchId: string,
  members: { id: string; first_name: string }[],
): Promise<EventSeedResult> {
  console.log('📦 Seeding events, tiers, registrations, tickets...');

   const branchIdFor = (b: 'hq' | 'lekki'): string => (b === 'hq' ? hqBranchId : lekkiBranchId);
  const events: { id: string }[] = [];
  const tiers: { id: string; eventIdx: number }[] = [];

   for (const e of EVENT_DEFS) {
    const title = e[0];
    const branch = e[1];
    const type = e[2];
    const start = e[3];
    const end = e[4];
    const loc = e[5];
    const cap = e[6];
    const price = e[7];
    const isFree = e[8];
    const existing = await prisma.event.findFirst({
      where: {
        church_id: churchId,
        title,
      },
    });
    if (existing) {
      events.push({ id: existing.id });
      continue;
    }
    const created = await prisma.event.create({
      data: {
        church_id: churchId,
        branch_id: branchIdFor(branch),
        title,
        type,
        description: 'Seeded ' + title,
        start_date: new Date(start),
        end_date: new Date(end),
        location: loc,
        capacity: cap ?? undefined,
        is_free: isFree ?? false,
        price: isFree ? undefined : price ?? undefined,
        registration_fields: [ 'full_name', 'email', 'phone' ],
      },
    });
    events.push({ id: created.id });
    console.log(`  ✅ Event: ${created.title} (${branch.toUpperCase()})`);
  }

   for (const t of TIER_DEFS) {
    const eventIndex = Number(t[0]);
    const name = t[1];
    const price = t[2];
    const cap = t[3];
    const ev = events[eventIndex];
    if (!ev) continue;
    const existing = await prisma.eventTicketTier.findFirst({
      where: {
        event_id: ev.id,
        name,
      },
    });
    if (existing) {
      tiers.push({ id: existing.id, eventIdx: eventIndex });
      continue;
    }
    const created = await prisma.eventTicketTier.create({
      data: {
        event_id: ev.id,
        name,
        price,
        capacity: cap ?? undefined,
        display_order: tiers.length + 1,
      },
    });
    tiers.push({ id: created.id, eventIdx: eventIndex });
    console.log(`  ✅ Tier: ${name} (₦${price.toLocaleString()})`);
  }

   let ticketCount = 0;
   for (const r of REG_DEFS) {
    const eventIndex = Number(r[0]);
    const memberIndex = Number(r[1]);
    const tierIndex = r[2] !== undefined && r[2] !== '' ? Number(r[2]) : undefined;
    const payStatus = r[3];
    const qty = r[4];
    const checkedIn = r[5] ?? false;
    const ev = events[eventIndex];
    const member = members[memberIndex];
    if (!ev || !member) continue;
    const tierRow = tierIndex !== undefined
      ? tiers.filter((x)) => x.eventIdx === eventIndex)[tierIndex]
      : undefined;
    const existing = await prisma.eventRegistration.findFirst({
      where: {
        event_id: ev.id,
        member_id: member.id,
      },
    });
    if (existing) {
      ticketCount += await prisma.ticket.count({
        where: { event_id: ev.id },
      });
      continue;
    }
    const reg = await prisma.eventRegistration.create({
      data: {
        church_id: churchId,
        event_id: ev.id,
        member_id: member.id,
        tier_id: tierRow ? tierRow.id : undefined,
        quantity: qty,
        payment_status: payStatus,
        payment_reference: payStatus === 'paid' ? 'EVT' + Date.now() + '_' + ticketCount : undefined,
        checked_in: checkedIn,
        custom_data: {
          full_name: member.first_name + ' Seeded',
          email: member.first_name.toLowerCase() + '.seeded@churchos.dev',
        },
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        event_id: ev.id,
        member_id: member.id,
        registration_id: reg.id,
        tier_name: tierRow ? tierRow.name : undefined,
        price_paid: tierRow ? tierRow.price : undefined,
        payment_reference: payStatus === 'paid' ? 'TKT' + Date.now() + '_' + ticketCount : undefined,
        code: 'TKT-' + ev.id.slice(0, 4).toUpperCase() + '-' + String(ticketCount + 1).padStart(3,, '0'),
        status: payStatus === 'paid' ? TicketStatus.paid : (payStatus === 'pending' ? TicketStatus.reserved : TicketStatus.cancelled),
        is_used: checkedIn,
      },
    });
    if (checkedIn) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { used_at: new Date() },
      });
    }
    ticketCount++;
    console.log(`  ✅ Registration: ${member.first_name} → ${ev.id.slice(0, 8)} (${payStatus})`);
  }

   console.log(`  🎉 Events: ${events.length}, tiers: ${tiers.length}, tickets: ${ticketCount}`);
   return { eventCount: events.length, ticketCount };
}
