import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BranchScopeService } from '../../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { contentBranch } from '../../../src/common/services/content-branch';
import { EventsService } from '../../../src/events/events.service';
import { SermonsService } from '../../../src/sermons/sermons.service';
import { TemplatesService } from '../../../src/templates/templates.service';
import { FormFieldType } from '../../../src/forms/dto/form-field.dto';
import { FormsService } from '../../../src/forms/forms.service';
import { BroadcastService } from '../../../src/broadcast/broadcast.service';
import { UpdateSermonDto } from '../../../src/sermons/dto/update-sermon.dto';
import { UpdateTemplateDto } from '../../../src/templates/dto/update-template.dto';
import { UpdateFormDto } from '../../../src/forms/dto/update-form.dto';
import { UpdateEventDto } from '../../../src/events/dto/update-event.dto';
import { UpdateBroadcastDto } from '../../../src/broadcast/dto/update-broadcast.dto';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

const church = '11111111-1111-4111-8111-111111111111';
const west = '22222222-2222-4222-8222-222222222222';
const east = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';
const now = new Date();
const fields = [{ key: 'name', label: 'Name', type: FormFieldType.TEXT }];
const saved = {
  id,
  church_id: church,
  branch_id: west,
  branch: { name: 'West Branch' },
  title: 'Gathering',
  name: 'Message',
  content: 'Hello',
  channel: 'email',
  language: 'en',
  status: 'draft',
  variables: [],
  tags: [],
  fields,
  sermon_date: now,
  start_date: now,
  created_at: now,
  updated_at: now,
  archived_at: null,
  is_template: false,
  is_public: false,
  submission_limit: 0,
  _count: { registrations: 0, submissions: 0 },
};

function setup(hq = true) {
  const prisma = createPrismaMock();
  prisma.branch.findFirst.mockResolvedValue({ id: east });
  const context = new RequestContextService();
  const scope = new BranchScopeService(context);
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = new EventsService(
    prisma as never,
    context,
    audit as never,
    new Map() as never,
    {} as never,
    scope,
    {} as never,
  );
  const sermons = new SermonsService(prisma as never, audit as never, scope);
  const templates = new TemplatesService(prisma as never, audit as never, scope);
  const forms = new FormsService(prisma as never, audit as never, scope);
  const queue = { add: jest.fn() };
  const broadcasts = new BroadcastService(
    prisma as never,
    context,
    audit as never,
    {} as never,
    queue as never,
    queue as never,
    queue as never,
    queue as never,
    { resolve: jest.fn() } as never,
  );
  const run = <T>(fn: () => T) =>
    context.run(
      {
        churchId: church,
        userId: 'user',
        role: 'church_admin',
        viewer: {
          church_id: church,
          role: 'church_admin',
          branch_id: west,
          is_admin_hq: hq,
        },
      },
      fn,
    );
  return { prisma, events, sermons, templates, forms, broadcasts, run, queue };
}

const operations = [
  {
    model: 'event',
    create: (s: ReturnType<typeof setup>, branchId?: string) =>
      s.events.createEvent(
        { title: 'Gathering', startDate: now.toISOString(), branchId },
        church,
        'user',
      ),
    update: (s: ReturnType<typeof setup>, branchId?: string) =>
      s.events.updateEvent(id, { title: 'Updated', branchId }, church, 'user'),
    detail: (s: ReturnType<typeof setup>) => s.events.getEvent(id, church),
  },
  {
    model: 'sermon',
    create: (s: ReturnType<typeof setup>, branchId?: string) =>
      s.sermons.createSermon(
        { title: 'Gathering', sermonDate: now.toISOString(), branchId },
        church,
        'user',
      ),
    update: (s: ReturnType<typeof setup>, branchId?: string) =>
      s.sermons.updateSermon(id, { title: 'Updated', branchId }, church, 'user'),
    detail: (s: ReturnType<typeof setup>) => s.sermons.getSermon(id, church),
  },
  {
    model: 'template',
    create: (s: ReturnType<typeof setup>, branchId?: string) =>
      s.templates.create(
        { name: 'Message', channel: 'email', content: 'Hello', branchId },
        church,
        'user',
      ),
    update: (s: ReturnType<typeof setup>, branchId?: string) =>
      s.templates.update(id, { name: 'Updated', branchId }, church, 'user'),
    detail: (s: ReturnType<typeof setup>) => s.templates.findById(id, church),
  },
  {
    model: 'form',
    create: (s: ReturnType<typeof setup>, branchId?: string) =>
      s.forms.createForm(church, { title: 'Gathering', fields, branchId }, 'user'),
    update: (s: ReturnType<typeof setup>, branchId?: string) =>
      s.forms.updateForm(church, id, { title: 'Updated', branchId }, 'user'),
    detail: (s: ReturnType<typeof setup>) => s.forms.getForm(church, id),
  },
];

for (const op of operations)
  describe(`${op.model} branch assignment`, () => {
    it('persists an HQ branch and returns its saved name', async () => {
      const s = setup();
      s.prisma[op.model].create.mockResolvedValue({
        ...saved,
        branch_id: east,
        branch: { name: 'East Branch' },
      });
      const result = await s.run(() => op.create(s, east));
      expect(result).toMatchObject({ branchId: east, branchName: 'East Branch' });
      expect(s.prisma[op.model].create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ branch_id: east }) }),
      );
      expect(s.prisma.branch.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: east, church_id: church, archived_at: null } }),
      );
    });
    it('defaults branch staff creation to their own branch', async () => {
      const s = setup(false);
      s.prisma[op.model].create.mockResolvedValue(saved);
      await s.run(() => op.create(s));
      expect(s.prisma[op.model].create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ branch_id: west }) }),
      );
    });
    it('rejects scoped creation in another branch', async () => {
      const s = setup(false);
      await expect(s.run(() => op.create(s, east))).rejects.toBeInstanceOf(ForbiddenException);
      expect(s.prisma[op.model].create).not.toHaveBeenCalled();
    });
    it('rejects foreign or archived branch creation', async () => {
      const s = setup();
      s.prisma.branch.findFirst.mockResolvedValue(null);
      await expect(s.run(() => op.create(s, east))).rejects.toBeInstanceOf(NotFoundException);
      expect(s.prisma[op.model].create).not.toHaveBeenCalled();
    });
    it('updates an HQ branch and returns the destination', async () => {
      const s = setup();
      s.prisma[op.model].findFirst.mockResolvedValue(saved);
      s.prisma[op.model].update.mockResolvedValue({
        ...saved,
        branch_id: east,
        branch: { name: 'East Branch' },
      });
      const result = await s.run(() => op.update(s, east));
      expect(result).toMatchObject({ branchId: east, branchName: 'East Branch' });
      const write = s.prisma[op.model].update.mock.calls[0][0].data;
      if (op.model === 'event' || op.model === 'sermon')
        expect(write.branch).toEqual({ connect: { id: east } });
      else expect(write.branch_id).toBe(east);
    });
    it('rejects scoped reassignment and does not write', async () => {
      const s = setup(false);
      s.prisma[op.model].findFirst.mockResolvedValue(saved);
      await expect(s.run(() => op.update(s, east))).rejects.toBeInstanceOf(ForbiddenException);
      expect(s.prisma[op.model].update).not.toHaveBeenCalled();
    });
    it('rejects an unavailable update destination', async () => {
      const s = setup();
      s.prisma[op.model].findFirst.mockResolvedValue(saved);
      s.prisma.branch.findFirst.mockResolvedValue(null);
      await expect(s.run(() => op.update(s, east))).rejects.toBeInstanceOf(NotFoundException);
      expect(s.prisma[op.model].update).not.toHaveBeenCalled();
    });
    it('preserves an unchanged legacy assignment without checking active destinations', async () => {
      const s = setup();
      s.prisma[op.model].findFirst.mockResolvedValue({ ...saved, branch_id: null, branch: null });
      s.prisma[op.model].update.mockResolvedValue({ ...saved, branch_id: null, branch: null });
      await s.run(() => op.update(s));
      expect(s.prisma.branch.findFirst).not.toHaveBeenCalled();
      const write = s.prisma[op.model].update.mock.calls[0][0].data;
      expect(write.branch).toBeUndefined();
      expect(write.branch_id).toBeUndefined();
    });
    it('includes branch information in details', async () => {
      const s = setup();
      s.prisma[op.model].findFirst.mockResolvedValue(saved);
      expect(await s.run(() => op.detail(s))).toMatchObject({
        branchId: west,
        branchName: 'West Branch',
      });
    });
  });

for (const Dto of [
  UpdateSermonDto,
  UpdateTemplateDto,
  UpdateFormDto,
  UpdateEventDto,
  UpdateBroadcastDto,
]) {
  it(`${Dto.name} accepts valid branch IDs and rejects malformed IDs`, async () => {
    expect(await validate(plainToInstance(Dto, { branchId: east }))).toHaveLength(0);
    expect(
      (await validate(plainToInstance(Dto, { branchId: 'invalid' }))).some(
        (error) => error.property === 'branchId',
      ),
    ).toBe(true);
  });
}

it('fails closed when branch staff have no assignment', async () => {
  const s = setup();
  await expect(
    contentBranch(s.prisma as never, { churchOnly: false }, church),
  ).rejects.toBeInstanceOf(ForbiddenException);
});
it('rejects an explicit null instead of clearing ownership', async () => {
  const s = setup();
  await expect(
    contentBranch(s.prisma as never, { churchOnly: true }, church, null as never),
  ).rejects.toBeInstanceOf(BadRequestException);
});

describe('broadcast branches', () => {
  const scheduled = {
    ...saved,
    template_id: id,
    status: 'scheduled',
    scheduled_at: new Date(Date.now() + 86400000),
    audience_filter: { branchId: west, status: 'active' },
    total_recipients: 1,
    sent_at: null,
  };
  function broadcastSetup(hq = true) {
    const s = setup(hq);
    s.prisma.broadcast.findFirst.mockResolvedValue(scheduled);
    s.prisma.template.findFirst.mockResolvedValue({
      ...saved,
      status: 'published',
      branch_id: null,
    });
    s.prisma.branch.findMany.mockResolvedValue([
      { id: east, name: 'East Branch' },
      { id: west, name: 'West Branch' },
    ]);
    s.prisma.member.findMany.mockResolvedValue([{ id: 'member', email: 'member@example.invalid' }]);
    s.prisma.broadcast.updateMany.mockResolvedValue({ count: 1 });
    (s.prisma.$transaction as unknown as jest.Mock).mockImplementation((fn) => fn(s.prisma));
    return s;
  }
  it('changes a future audience atomically and never dispatches a message', async () => {
    const s = broadcastSetup();
    s.prisma.broadcast.findFirst
      .mockResolvedValueOnce(scheduled)
      .mockResolvedValueOnce({ ...scheduled, audience_filter: { branchId: east } });
    const result = await s.run(() => s.broadcasts.update(id, { branchId: east }, church, 'user'));
    expect(result).toMatchObject({ branchId: east, branchName: 'East Branch' });
    expect(s.prisma.broadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ church_id: church, status: 'scheduled' }),
        data: expect.objectContaining({
          audience_filter: { branchId: east, status: 'active' },
          total_recipients: 1,
        }),
      }),
    );
    expect(s.prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ church_id: church, branch_id: east }),
      }),
    );
    expect(s.prisma.broadcastRecipient.deleteMany).toHaveBeenCalledWith({
      where: { broadcast_id: id },
    });
    expect(s.prisma.broadcastRecipient.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ broadcast_id: id, member_id: 'member', status: 'pending' })],
    });
    expect(s.queue.add).not.toHaveBeenCalled();
  });
  it('does not replace recipients when sending wins the conditional update', async () => {
    const s = broadcastSetup();
    s.prisma.broadcast.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      s.run(() => s.broadcasts.update(id, { branchId: east }, church, 'user')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s.prisma.broadcastRecipient.deleteMany).not.toHaveBeenCalled();
  });
  it.each(['sending', 'sent', 'failed', 'cancelled', 'draft'])(
    'refuses branch changes for %s broadcasts',
    async (status) => {
      const s = broadcastSetup();
      s.prisma.broadcast.findFirst.mockResolvedValue({ ...scheduled, status });
      await expect(
        s.run(() => s.broadcasts.update(id, { branchId: east }, church, 'user')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(s.prisma.broadcast.updateMany).not.toHaveBeenCalled();
    },
  );
  it('rejects a cross-branch staff reassignment', async () => {
    const s = broadcastSetup(false);
    await expect(
      s.run(() => s.broadcasts.update(id, { branchId: east }, church, 'user')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects a template unavailable in the destination branch', async () => {
    const s = broadcastSetup();
    s.prisma.template.findFirst.mockResolvedValue(null);
    await expect(
      s.run(() => s.broadcasts.update(id, { branchId: east }, church, 'user')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s.prisma.broadcast.updateMany).not.toHaveBeenCalled();
  });
  it('filters lists by the HQ branch selection and returns branch names', async () => {
    const s = broadcastSetup();
    s.prisma.broadcast.findMany.mockResolvedValue([
      { ...scheduled, audience_filter: { branchId: east } },
    ]);
    s.prisma.broadcast.count.mockResolvedValue(1);
    s.prisma.template.findMany.mockResolvedValue([{ id, name: 'Template' }]);
    const result = await s.run(() => s.broadcasts.findAll(church, { branchId: east }));
    expect(result.data[0]).toMatchObject({ branchId: east, branchName: 'East Branch' });
    expect(s.prisma.broadcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          church_id: church,
          audience_filter: { path: ['branchId'], equals: east },
        }),
      }),
    );
  });
  it('keeps branch staff lists scoped when another filter is supplied', async () => {
    const s = broadcastSetup(false);
    s.prisma.broadcast.findMany.mockResolvedValue([]);
    s.prisma.broadcast.count.mockResolvedValue(0);
    s.prisma.template.findMany.mockResolvedValue([]);
    await s.run(() => s.broadcasts.findAll(church, { branchId: east }));
    expect(s.prisma.broadcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ audience_filter: { path: ['branchId'], equals: west } }),
      }),
    );
  });
  it('creates an HQ broadcast with the same saved branch and recipient scope', async () => {
    const s = broadcastSetup();
    s.prisma.broadcast.create.mockResolvedValue({
      ...scheduled,
      audience_filter: { branchId: east },
    });
    const result = await s.run(() =>
      s.broadcasts.create(
        {
          name: 'Reminder',
          templateId: id,
          channel: 'email',
          branchId: east,
          scheduledAt: scheduled.scheduled_at.toISOString(),
        },
        church,
        'user',
      ),
    );
    expect(result).toMatchObject({ branchId: east, branchName: 'East Branch' });
    expect(s.prisma.broadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ audience_filter: { branchId: east } }),
      }),
    );
    expect(s.prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branch_id: east, church_id: church }),
      }),
    );
    expect(s.queue.add).not.toHaveBeenCalled();
  });
  it('defaults scoped broadcasts to the staff branch', async () => {
    const s = broadcastSetup(false);
    s.prisma.broadcast.create.mockResolvedValue(scheduled);
    await s.run(() =>
      s.broadcasts.create(
        {
          name: 'Reminder',
          templateId: id,
          channel: 'email',
          scheduledAt: scheduled.scheduled_at.toISOString(),
        },
        church,
        'user',
      ),
    );
    expect(s.prisma.broadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ audience_filter: { branchId: west } }),
      }),
    );
  });
  it('rejects scoped creation targeting another branch', async () => {
    const s = broadcastSetup(false);
    await expect(
      s.run(() =>
        s.broadcasts.create(
          { name: 'Reminder', templateId: id, channel: 'email', branchId: east },
          church,
          'user',
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.prisma.broadcast.create).not.toHaveBeenCalled();
    expect(s.queue.add).not.toHaveBeenCalled();
  });
  it('rejects foreign or archived broadcast destinations', async () => {
    const s = broadcastSetup();
    s.prisma.branch.findFirst.mockResolvedValue(null);
    await expect(
      s.run(() =>
        s.broadcasts.create(
          { name: 'Reminder', templateId: id, channel: 'email', branchId: east },
          church,
          'user',
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(s.prisma.broadcast.create).not.toHaveBeenCalled();
  });
  it('refuses an empty recipient replacement without changing the scheduled broadcast', async () => {
    const s = broadcastSetup();
    s.prisma.member.findMany.mockResolvedValue([]);
    await expect(
      s.run(() => s.broadcasts.update(id, { branchId: east }, church, 'user')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s.prisma.broadcast.updateMany).not.toHaveBeenCalled();
  });
  it('refuses a scheduled message whose sending time has arrived', async () => {
    const s = broadcastSetup();
    s.prisma.broadcast.findFirst.mockResolvedValue({ ...scheduled, scheduled_at: new Date(0) });
    await expect(
      s.run(() => s.broadcasts.update(id, { branchId: east }, church, 'user')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s.prisma.broadcast.updateMany).not.toHaveBeenCalled();
  });
});
