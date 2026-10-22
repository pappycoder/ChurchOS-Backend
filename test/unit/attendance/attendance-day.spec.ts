import { validate } from 'class-validator';
import { attendanceDay } from '../../../src/attendance/attendance-day';
import { RecordBulkAttendanceDto } from '../../../src/attendance/dto/record-bulk-attendance.dto';
import { BulkCheckInDto } from '../../../src/events/dto/check-in.dto';

describe('Roster attendance dates', () => {
  it.each(['2026-10-18', '2024-02-29'])('preserves the selected calendar day %s', (value) => {
    const result = attendanceDay(value);
    expect(result.checkedInAt.toISOString()).toBe(`${value}T00:00:00.000Z`);
    expect(result.attendanceDate.toISOString()).toBe(`${value}T00:00:00.000Z`);
  });
  it('retains the current instant for older clients omitting a date', () => {
    const before = Date.now();
    expect(attendanceDay().checkedInAt.getTime()).toBeGreaterThanOrEqual(before);
  });
  it.each(['', '2026-02-30', '2025-02-29', '2026-13-01', '2026-10-18T12:00:00Z', '18/10/2026'])(
    'rejects invalid dates %s in the service layer',
    (value) => {
      expect(() => attendanceDay(value)).toThrow('YYYY-MM-DD');
    },
  );
  it.each([RecordBulkAttendanceDto, BulkCheckInDto])(
    'validates the inherited attendance date on %p',
    async (Dto) => {
      for (const attendanceDate of ['2026-10-18', undefined]) {
        const errors = await validate(Object.assign(new Dto(), { attendanceDate }));
        expect(errors.filter((error) => error.property === 'attendanceDate')).toEqual([]);
      }
      for (const attendanceDate of ['', '2026-02-30', '2026-10-18T12:00:00Z']) {
        const errors = await validate(Object.assign(new Dto(), { attendanceDate }));
        expect(errors.some((error) => error.property === 'attendanceDate')).toBe(true);
      }
    },
  );
});
