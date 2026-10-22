import { validate } from 'class-validator';
import { parseGivingDate } from '../../../src/giving/giving-date';
import { RecordCashDto } from '../../../src/giving/dto/record-cash.dto';

describe('Giving calendar dates', () => {
  it.each(['2026-10-18', '2024-02-29'])('preserves %s without a time component', (date) => {
    expect(parseGivingDate(date).toISOString()).toBe(`${date}T00:00:00.000Z`);
  });
  it.each(['', '2026-02-30', '2025-02-29', '2026-10-18T12:00:00Z', '18/10/2026'])(
    'rejects %p before saving',
    (date) => {
      expect(() => parseGivingDate(date)).toThrow('Giving date');
    },
  );
  it('validates givingDate through the cash/bank DTO', async () => {
    for (const givingDate of ['2026-10-18', undefined]) {
      expect(
        (await validate(Object.assign(new RecordCashDto(), { givingDate }))).filter(
          (error) => error.property === 'givingDate',
        ),
      ).toEqual([]);
    }
    for (const givingDate of ['', '2026-02-30', '2026-10-18T12:00:00Z']) {
      expect(
        (await validate(Object.assign(new RecordCashDto(), { givingDate }))).some(
          (error) => error.property === 'givingDate',
        ),
      ).toBe(true);
    }
  });
});
