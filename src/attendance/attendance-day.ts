import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';

/** Explicit roster dates are calendar days; created_at retains the actual recording instant. */
export function attendanceDay(value?: string): { checkedInAt: Date; attendanceDate: Date } {
  if (
    value !== undefined &&
    (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !isISO8601(value, { strict: true }))
  )
    throw new BadRequestException('Attendance date must be a valid YYYY-MM-DD date');
  const checkedInAt = value === undefined ? new Date() : new Date(`${value}T00:00:00.000Z`);
  return { checkedInAt, attendanceDate: new Date(checkedInAt.toISOString().slice(0, 10)) };
}
