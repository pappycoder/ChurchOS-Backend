import { BadRequestException } from '@nestjs/common';

/** Recurring service schedules are local clock times, independent of dates/time zones. */
export const SERVICE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function serviceTimeForStorage(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !SERVICE_TIME_PATTERN.test(value))
    throw new BadRequestException('Service time must use 24-hour HH:mm format');
  // Prisma represents PostgreSQL TIME values with Date objects anchored to 1970-01-01 UTC.
  return new Date(`1970-01-01T${value}:00.000Z`);
}

export function serviceTimeForResponse(value: Date | null): string | undefined {
  return value?.toISOString().slice(11, 16);
}
