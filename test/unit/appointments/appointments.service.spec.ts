/**
 * @file appointments.service.spec.ts
 * @description Unit tests for AppointmentsService (booking registry, secretary↔pastor).
 */

import { AppointmentsService, PASTOR_ROLES } from '../../../src/appointments/appointments.service';

function createPrismaMock() {
  const models: Record<string, Record<string, jest.Mock>> = {};
  const handl = { log: jest.fn().mockResolvedValue(undefined) };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === '$transaction') return jest.fn();
      if (prop === '$queryRaw') return jest.fn().mockResolvedValue([]);
      if (!models[prop]) {
        models[prop] = {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          createMany: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          delete: jest.fn(),
          deleteMany: jest.fn(),
          count: jest.fn(),
          aggregate: jest.fn(),
          groupBy: jest.fn(),
          upsert: jest.fn(),
        };
      }
      return models[prop];
    },
  };
  const prisma = new Proxy({} as Record<string, unknown>, handler) as Record<string, unknown> & {
    $transaction: jest.Mock;
  };
  prisma.$transaction = jest.fn();
  return { prisma, models, handl };
}

let mocks: ReturnType<typeof createPrismaMock>;
let prisma: ReturnType<typeof createPrismaMock>['prisma'];
let audit: { log: jest.Mock };
let service: AppointmentsService;

const CHURCH = '00000000-0000-0000-0000-000000000001';
const SEC = '22222222-2222-2222-2222-222222222222';
const PASTOR = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = '33333333-3333-3333-3333-333333333333';
const BRANCH_B = '44444444-4444-4444-4444-444444444444';

function scopeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    is_admin_hq: false,
    role: ['secretary'],
    branch_id: BRANCH_A,
    branch: { is_headquarters: false },
    ...overrides,
  };
}

function pastorRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PASTOR,
    first_name: 'Pastor John',
    last_name: 'Adebayo',
    role: ['branch_pastor'],
    status: 'active',
    is_admin_hq: false,
    branch_id: BRANCH_A,
    avatar_url: null,
    branch: { id: BRANCH_A, name: 'Main Campus' },
    ...overrides,
  };
}

function apptRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '99999999-9999-9999-9999-999999999999',
    church_id: CHURCH,
    branch_id: BRANCH_A,
    secretary_id: SEC,
    pastor_id: PASTOR,
    title: 'Budget planning',
    scheduled_at: new Date('2026-09-05T10:00:00.000Z'),
    location: null,
    notes: null,
    status: 'pending',
    created_at: new Date('2026-08-30T08:00:00.000Z'),
    archived_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks = createPrismaMock();
  prisma = mocks.prisma;
  audit = mocks.handl as { log: jest.Mock };
  service = new AppointmentsService(prisma as never, audit as never);
});

function model(name: string): Record<string, jest.Mock> {
  return prisma[name] as unknown as Record<string, jest.Mock>;
}

describe('AppointmentsService', () => {
  it('exports pastor roles', () => {
    expect([...PASTOR_ROLES]).toEqual(['branch_pastor', 'church_admin', 'senior_pastor']);
  });

  describe('create', () => {
    it('creates an appointment as a branch secretary with a same-branch pastor', async () => {
      model('profile').findFirst.mockResolvedValueOnce(scopeRow()); // resolveScope
      model('profile').findFirst.mockResolvedValueOnce(pastorRow()); // fetchCounterpart
      model('appointment').create.mockResolvedValueOnce(apptRow());
      model('profile').findMany.mockResolvedValueOnce([
        { id: SEC, first_name: 'Bola', last_name: 'Okonkwo', role: ['secretary'] },
        { id: PASTOR, first_name: 'Pastor John', last_name: 'Adebayo', role: ['branch_pastor'] },
      ]);

      const result = await service.create(
        {
          title: 'Budget planning',
          scheduledAt: '2026-09-05T10:00:00.000Z',
          counterpartId: PASTOR,
        },
        CHURCH,
        SEC,
        'user-1',
      );

      expect(result.secretaryId).toBe(SEC);
      expect(result.pastorId).toBe(PASTOR);
      expect(model('appointment').create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Budget planning',
            secretary_id: SEC,
            pastor_id: PASTOR,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'appointment', action: 'CREATE' }),
      );
    });

    it('rejects a cross-branch pastor for a branch secretary', async () => {
      model('profile').findFirst.mockResolvedValueOnce(scopeRow());
      model('profile').findFirst.mockResolvedValueOnce(
        pastorRow({ branch_id: BRANCH_B, branch: { id: BRANCH_B, name: 'Branch B' } }),
      );

      await expect(
        service.create(
          {
            title: 'Budget planning',
            scheduledAt: '2026-09-05T10:00:00.000Z',
            counterpartId: PASTOR,
          },
          CHURCH,
          SEC,
          'user-1',
        ),
      ).rejects.toThrow('same branch');
    });

    it('allows an HQ secretary to book a church-wide pastor', async () => {
      model('profile').findFirst.mockResolvedValueOnce(
        scopeRow({ is_admin_hq: true, branch_id: BRANCH_B, branch: { is_headquarters: true } }),
      );
      model('profile').findFirst.mockResolvedValueOnce(
        pastorRow({ branch_id: BRANCH_A, branch: { id: BRANCH_A, name: 'Main Campus' } }),
      );
      model('appointment').create.mockResolvedValueOnce(apptRow());
      model('profile').findMany.mockResolvedValueOnce([
        { id: SEC, first_name: 'Bola', last_name: 'Okonkwo', role: ['secretary'] },
        { id: PASTOR, first_name: 'Pastor John', last_name: 'Adebayo', role: ['branch_pastor'] },
      ]);

      const result = await service.create(
        {
          title: 'Budget planning',
          scheduledAt: '2026-09-05T10:00:00.000Z',
          counterpartId: PASTOR,
        },
        CHURCH,
        SEC,
        'user-1',
      );
      expect(result.pastorId).toBe(PASTOR);
    });

    it('rejects non-secretary/pastor roles', async () => {
      model('profile').findFirst.mockResolvedValueOnce(scopeRow({ role: ['member'] }));
      await expect(
        service.create(
          { title: 'x', scheduledAt: '2026-09-05T10:00:00.000Z', counterpartId: PASTOR },
          CHURCH,
          SEC,
          'u',
        ),
      ).rejects.toThrow('Only secretary and pastor roles');
    });

    it('rejects self-appointment', async () => {
      model('profile').findFirst.mockResolvedValueOnce(scopeRow());
      await expect(
        service.create(
          { title: 'x', scheduledAt: '2026-09-05T10:00:00.000Z', counterpartId: SEC },
          CHURCH,
          SEC,
          'u',
        ),
      ).rejects.toThrow('with yourself');
    });
  });

  describe('list', () => {
    it('filters to the current scope (secretary or pastor) with active rows + summary', async () => {
      model('appointment').findMany.mockResolvedValueOnce([apptRow()]);
      model('appointment').count.mockResolvedValueOnce(1);
      model('profile').findMany.mockResolvedValueOnce([
        { id: SEC, first_name: 'Bola', last_name: 'Okonkwo', role: ['secretary'] },
        { id: PASTOR, first_name: 'Pastor John', last_name: 'Adebayo', role: ['branch_pastor'] },
      ]);
      model('appointment').groupBy.mockResolvedValueOnce([
        { status: 'pending', _count: { _all: 1 } },
      ]);

      const result = await service.list(CHURCH, SEC, {
        page: 1,
        limit: 30,
      });

      expect(result.total).toBe(1);
      expect(result.data[0].secretaryId).toBe(SEC);
      expect(model('appointment').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            church_id: CHURCH,
            OR: [{ secretary_id: SEC }, { pastor_id: SEC }],
            archived_at: null,
          }),
        }),
      );
      expect(result.summary.pending).toBe(1);
    });

    it('applies status, search, and date filters and the archived view', async () => {
      model('appointment').findMany.mockResolvedValueOnce([]);
      model('appointment').count.mockResolvedValueOnce(0);
      model('profile').findMany.mockResolvedValueOnce([]);
      model('appointment').groupBy.mockResolvedValueOnce([]);

      await service.list(CHURCH, SEC, {
        status: 'confirmed',
        search: 'budget',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        archived: true,
      });

      const where = model('appointment').findMany.mock.calls[0][0].where;
      expect(where.status).toBe('confirmed');
      expect(where.archived_at).toEqual({ not: null });
      expect(where.scheduled_at).toEqual(
        expect.objectContaining({
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lte: new Date('2026-09-30T23:59:59.999Z'),
        }),
      );
    });
  });

  describe('getOne', () => {
    it('returns the appointment for a party', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(apptRow());
      model('profile').findMany.mockResolvedValueOnce([
        { id: SEC, first_name: 'Bola', last_name: 'Okonkwo', role: ['secretary'] },
      ]);
      const result = await service.getOne(apptRow().id as string, CHURCH, SEC);
      expect(result.id).toBe(apptRow().id);
    });

    it('404s when not a party', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(null);
      await expect(service.getOne('x', CHURCH, SEC)).rejects.toThrow('not found');
    });
  });

  describe('update', () => {
    it('updates status/title fields', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(apptRow());
      model('profile').findFirst.mockResolvedValueOnce(scopeRow()); // resolveScope
      model('appointment').update.mockResolvedValueOnce(apptRow({ status: 'confirmed' }));
      model('profile').findMany.mockResolvedValueOnce([
        { id: SEC, first_name: 'Bola', last_name: 'Okonkwo', role: ['secretary'] },
      ]);

      const result = await service.update(
        apptRow().id as string,
        { status: 'confirmed' },
        CHURCH,
        SEC,
        'user-1',
      );
      expect(result.status).toBe('confirmed');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entity: 'appointment' }),
      );
    });

    it('re-changes the pastor within scope when counterpartId given', async () => {
      const newPastor = '55555555-5555-5555-5555-555555555555';
      model('appointment').findFirst.mockResolvedValueOnce(apptRow());
      model('profile').findFirst.mockResolvedValueOnce(scopeRow()); // resolveScope
      model('profile').findFirst.mockResolvedValueOnce(
        pastorRow({ id: newPastor, role: ['branch_pastor'], branch_id: BRANCH_A }),
      ); // fetchCounterpart
      model('appointment').update.mockResolvedValueOnce(apptRow({ pastor_id: newPastor }));
      model('profile').findMany.mockResolvedValueOnce([
        { id: SEC, first_name: 'Bola', last_name: 'Okonkwo', role: ['secretary'] },
      ]);

      await service.update(apptRow().id as string, { counterpartId: newPastor }, CHURCH, SEC, 'u');
      const data = model('appointment').update.mock.calls[0][0].data;
      expect(data.pastor_id).toBe(newPastor);
      expect(data.secretary_id).toBe(SEC);
    });
  });

  describe('archive / restore / delete', () => {
    it('archives an active appointment', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(apptRow());
      model('appointment').update.mockResolvedValueOnce(apptRow({ archived_at: new Date() }));
      await service.archive(apptRow().id as string, CHURCH, SEC, 'u');
      expect(model('appointment').update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archived_at: expect.any(Date) } }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ARCHIVE' }));
    });

    it('400s archiving an already-archived appointment', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(apptRow({ archived_at: new Date() }));
      await expect(service.archive(apptRow().id as string, CHURCH, SEC, 'u')).rejects.toThrow(
        'already archived',
      );
    });

    it('restores an archived appointment', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(apptRow({ archived_at: new Date() }));
      model('appointment').update.mockResolvedValueOnce(apptRow());
      await service.restore(apptRow().id as string, CHURCH, SEC, 'u');
      expect(model('appointment').update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archived_at: null } }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESTORE' }));
    });

    it('400s restoring a non-archived appointment', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(apptRow());
      await expect(service.restore(apptRow().id as string, CHURCH, SEC, 'u')).rejects.toThrow(
        'not archived',
      );
    });

    it('purges an archived appointment', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(apptRow({ archived_at: new Date() }));
      model('appointment').delete.mockResolvedValueOnce(apptRow());
      await service.deleteForever(apptRow().id as string, CHURCH, SEC, 'u');
      expect(model('appointment').delete).toHaveBeenCalledWith({
        where: { id: apptRow().id },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }));
    });

    it('400s deleting a non-archived appointment', async () => {
      model('appointment').findFirst.mockResolvedValueOnce(apptRow());
      await expect(service.deleteForever(apptRow().id as string, CHURCH, SEC, 'u')).rejects.toThrow(
        'archived before permanent deletion',
      );
    });
  });

  describe('contacts', () => {
    it('lists pastor counterparts in the same branch for a branch secretary', async () => {
      model('profile').findFirst.mockResolvedValueOnce(scopeRow());
      model('profile').findMany.mockResolvedValueOnce([pastorRow()]);

      const result = await service.listContacts(CHURCH, SEC, {});

      expect(result.total).toBe(1);
      expect(result.data[0].isPastor).toBe(true);
      const where = model('profile').findMany.mock.calls[0][0].where;
      expect(where.role.hasSome).toContain('branch_pastor');
      expect(where.branch_id).toBe(BRANCH_A);
    });

    it('lists secretaries for a pastor viewer', async () => {
      model('profile').findFirst.mockResolvedValueOnce(
        scopeRow({ role: ['branch_pastor'], branch_id: BRANCH_A }),
      );
      model('profile').findMany.mockResolvedValueOnce([
        { ...scopeRow(), role: ['secretary'], isPastor: undefined },
      ]);

      const result = await service.listContacts(CHURCH, '11111111-1111-1111-1111-111111111111', {});
      expect(result.data[0].isPastor).toBe(false);
      const where = model('profile').findMany.mock.calls[0][0].where;
      expect(where.role.hasSome).toEqual(['secretary']);
    });
  });
});
