import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';

export function parseGivingDate(value: string): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !isISO8601(value, { strict: true })
  )
    throw new BadRequestException('Giving date must be a valid YYYY-MM-DD date');
  return new Date(`${value}T00:00:00.000Z`);
}
