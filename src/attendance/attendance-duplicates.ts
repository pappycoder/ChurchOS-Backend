import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export function isAttendanceDuplicate(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

export function attendanceConflict(error: unknown): never {
  if (isAttendanceDuplicate(error))
    throw new ConflictException('This person is already checked in for this event or service date');
  throw error;
}

export function attendanceVisitorName(name?: string | null): string | null {
  return name?.trim().replace(/\s+/g, ' ') || null;
}

export async function visitorAlreadyAttended(
  prisma: PrismaService,
  churchId: string,
  context: { serviceId?: string; eventId?: string },
  person: { visitorId?: string; visitorName?: string },
  attendanceDate: Date,
): Promise<boolean> {
  const name = attendanceVisitorName(person.visitorName);
  if (!person.visitorId && !name) return false;
  return !!(await prisma.attendance.findFirst({
    where: {
      church_id: churchId,
      ...(context.eventId
        ? { event_id: context.eventId }
        : { service_id: context.serviceId, attendance_date: attendanceDate }),
      ...(person.visitorId
        ? { visitor_id: person.visitorId }
        : {
            member_id: null,
            visitor_id: null,
            visitor_name: { equals: name!, mode: 'insensitive' },
          }),
    },
    select: { id: true },
  }));
}
