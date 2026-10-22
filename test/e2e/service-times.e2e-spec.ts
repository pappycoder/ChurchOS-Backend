import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import { BranchScopeService } from '../../src/common/services/branch-scope.service';

// e2e-env.ts refuses non-local/non-test databases before this module loads.
describe('Recurring service times with PostgreSQL', () => {
  const prisma = new PrismaService();
  const context = new RequestContextService();
  const church = randomUUID();
  const service = new AttendanceService(
    prisma,
    context,
    { log: jest.fn() } as never,
    new BranchScopeService(context),
  );
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.church.create({ data: { id: church, name: 'Service time fixture' } });
  });
  afterAll(async () => {
    try {
      await prisma.service.deleteMany({ where: { church_id: church } });
      await prisma.church.delete({ where: { id: church } });
    } finally {
      await prisma.$disconnect();
    }
  });
  it('stores time columns without a calendar date or timezone', async () => {
    const columns = await prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='services' AND column_name IN ('start_time','end_time')`;
    expect(columns).toHaveLength(2);
    expect(columns.every((column) => column.data_type === 'time without time zone')).toBe(true);
  });
  it('creates, reloads, changes and clears a recurring service through Prisma', async () => {
    const created = await service.createService(
      {
        name: 'Sunday Service',
        category: 'mixed',
        dayOfWeek: 0,
        startTime: '09:00',
        endTime: '11:00',
      },
      church,
      randomUUID(),
      { church_id: church, role: 'church_admin', is_admin_hq: true },
    );
    expect(created).toMatchObject({ startTime: '09:00', endTime: '11:00' });
    expect(await service.getServiceById(created.serviceId, church)).toMatchObject({
      startTime: '09:00',
      endTime: '11:00',
    });
    expect(
      await service.updateService(
        created.serviceId,
        { startTime: '23:30', endTime: '00:00' },
        church,
        randomUUID(),
      ),
    ).toMatchObject({ startTime: '23:30', endTime: '00:00' });
    const cleared = await service.updateService(
      created.serviceId,
      { startTime: null, endTime: null },
      church,
      randomUUID(),
    );
    expect(cleared.startTime).toBeUndefined();
    expect(cleared.endTime).toBeUndefined();
  });
  it('migrates legacy timestamps without shifting their clock values or nulls', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE services (start_time timestamp(3), end_time timestamp(3)) ON COMMIT DROP',
      );
      await tx.$executeRawUnsafe(
        "INSERT INTO services VALUES ('2026-10-22 09:15:30.123', '2026-10-22 23:59:00'), (NULL, NULL)",
      );
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Auckland'");
      await tx.$executeRawUnsafe(
        readFileSync(
          resolve(
            process.cwd(),
            'prisma/migrations/20261022190000_service_clock_times/migration.sql',
          ),
          'utf8',
        ),
      );
      const rows = await tx.$queryRawUnsafe<Array<{ start: string | null; end: string | null }>>(
        'SELECT start_time::text AS start, end_time::text AS end FROM pg_temp.services ORDER BY start_time NULLS LAST',
      );
      expect(rows).toEqual([
        { start: '09:15:30.123', end: '23:59:00' },
        { start: null, end: null },
      ]);
    });
  });
});
