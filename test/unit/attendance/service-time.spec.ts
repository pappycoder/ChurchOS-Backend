import { validate } from 'class-validator';
import { CreateServiceDto } from '../../../src/attendance/dto/create-service.dto';
import { UpdateServiceDto } from '../../../src/attendance/dto/update-service.dto';
import {
  serviceTimeForStorage,
  serviceTimeForResponse,
} from '../../../src/attendance/service-time';

describe('Recurring service clock times', () => {
  it.each(['00:00', '09:00', '12:30', '23:59'])(
    'round-trips %s without a date or timezone shift',
    (time) => {
      expect(serviceTimeForResponse(serviceTimeForStorage(time))).toBe(time);
    },
  );
  it.each(['24:00', '09:60', '9:00', 'Sunday', '2026-01-01T09:00:00.000Z', 900])(
    'rejects malformed input %p before Prisma',
    (value) => {
      expect(() => serviceTimeForStorage(value as string)).toThrow('HH:mm');
    },
  );
  it('clears omitted/empty times without creating an invalid Date', () => {
    for (const value of [null, undefined, '']) expect(serviceTimeForStorage(value)).toBeNull();
    expect(serviceTimeForResponse(null)).toBeUndefined();
  });
  it('reads existing timestamp records as their stored clock time', () => {
    expect(serviceTimeForResponse(new Date('2026-10-22T09:00:00.000Z'))).toBe('09:00');
  });
  it.each([CreateServiceDto, UpdateServiceDto])(
    'validates time inputs and nullable clearing with %p',
    async (Dto) => {
      for (const value of ['09:00', '23:59', null, undefined]) {
        expect(
          await validate(
            Object.assign(new Dto(), { name: 'Sunday Service', startTime: value, endTime: value }),
          ),
        ).toEqual([]);
      }
      for (const value of ['Invalid Date', '24:00', '09:60', '2026-10-22T09:00:00Z', 900]) {
        const errors = await validate(
          Object.assign(new Dto(), { name: 'Sunday Service', startTime: value, endTime: value }),
        );
        expect(errors.map((error) => error.property)).toEqual(
          expect.arrayContaining(['startTime', 'endTime']),
        );
      }
    },
  );
});
