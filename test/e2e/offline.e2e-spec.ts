import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FormsService } from '../../src/forms/forms.service';
import { BranchScopeService } from '../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import { OfflineService } from '../../src/sync/offline.service';
import { OfflineMutationDto } from '../../src/sync/dto/offline.dto';

describe('Offline workspace with PostgreSQL', () => {
  const prisma = new PrismaService();
  const churchId = randomUUID(),
    branchId = randomUUID(),
    otherBranch = randomUUID();
  const userId = randomUUID(),
    profileId = randomUUID();
  const viewer = {
    id: profileId,
    church_id: churchId,
    branch_id: branchId,
    role: 'secretary',
    is_admin_hq: false,
    permissions: [
      'members:all:read',
      'members:new:create',
      'members:all:update',
      'visitors:list:read',
      'visitors:new:create',
      'visitors:list:update',
      'forms:list:read',
    ],
  };
  const forms = new FormsService(
    prisma,
    { log: jest.fn() } as never,
    new BranchScopeService(new RequestContextService()),
  );
  const service = new OfflineService(prisma, forms);
  const mutation = (overrides: Partial<OfflineMutationDto> = {}): OfflineMutationDto => ({
    mutationId: randomUUID(),
    entityId: randomUUID(),
    entity: 'member',
    action: 'create',
    branchId,
    data: { firstName: 'Ada', lastName: 'Obi' },
    ...overrides,
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.church.create({ data: { id: churchId, name: 'Isolated offline tests' } });
    await prisma.branch.createMany({
      data: [
        { id: branchId, church_id: churchId, name: 'Lekki' },
        { id: otherBranch, church_id: churchId, name: 'HQ' },
      ],
    });
  });
  afterAll(async () => {
    await prisma.formSubmission.deleteMany({ where: { church_id: churchId } });
    await prisma.form.deleteMany({ where: { church_id: churchId } });
    await prisma.member.deleteMany({ where: { church_id: churchId } });
    await prisma.visitor.deleteMany({ where: { church_id: churchId } });
    await prisma.offlineReceipt.deleteMany({ where: { church_id: churchId } });
    await prisma.syncQueue.deleteMany({ where: { church_id: churchId } });
    await prisma.auditLog.deleteMany({ where: { church_id: churchId } });
    await prisma.branch.deleteMany({ where: { church_id: churchId } });
    await prisma.church.delete({ where: { id: churchId } });
    await prisma.$disconnect();
  });
  it('returns branch-specific permitted records and a time-limited lease', async () => {
    await prisma.member.create({
      data: {
        church_id: churchId,
        branch_id: otherBranch,
        first_name: 'Other',
        last_name: 'Branch',
      },
    });
    const result = await service.snapshot(viewer, branchId);
    expect(result.profileId).toBe(profileId);
    expect(result.records.member.every((row) => row.branch_id === branchId)).toBe(true);
    expect(Date.parse(result.expiresAt) - Date.parse(result.issuedAt)).toBeLessThanOrEqual(
      7 * 86400000 + 100,
    );
  });
  it('rejects cross-branch preparation but lets Admin HQ prepare either branch', async () => {
    await expect(service.snapshot(viewer, otherBranch)).rejects.toThrow('your branch');
    expect(
      (await service.snapshot({ ...viewer, is_admin_hq: true }, otherBranch)).records.member,
    ).toHaveLength(1);
  });
  it('does not download entities without read permission', async () => {
    const result = await service.snapshot({ ...viewer, permissions: [] }, branchId);
    expect(result.records).toEqual({ member: [], visitor: [], form: [] });
  });
  it('atomically records the mutation effect and a durable acknowledgement', async () => {
    const change = mutation();
    expect((await service.push(viewer, userId, [change]))[0].status).toBe('accepted');
    expect(await prisma.member.findUnique({ where: { id: change.entityId } })).toMatchObject({
      branch_id: branchId,
      first_name: 'Ada',
    });
    expect(await prisma.offlineReceipt.count({ where: { mutation_id: change.mutationId } })).toBe(
      1,
    );
  });
  it('replays the same acknowledgement after a lost response', async () => {
    const change = mutation();
    const first = await service.push(viewer, userId, [change]);
    const second = await service.push(viewer, userId, [change]);
    expect(second).toEqual(first);
    expect(await prisma.member.count({ where: { id: change.entityId } })).toBe(1);
  });
  it('serializes simultaneous replays across service instances', async () => {
    const change = mutation();
    const secondService = new OfflineService(prisma, forms);
    const responses = await Promise.all([
      service.push(viewer, userId, [change]),
      secondService.push(viewer, userId, [change]),
    ]);
    expect(responses[0]).toEqual(responses[1]);
    expect(await prisma.offlineReceipt.count({ where: { mutation_id: change.mutationId } })).toBe(
      1,
    );
  });
  it('rejects a mutation ID reused with a different payload', async () => {
    const change = mutation();
    await service.push(viewer, userId, [change]);
    const ack = await service.push(viewer, userId, [
      { ...change, data: { firstName: 'Changed', lastName: 'Obi' } },
    ]);
    expect(ack[0].status).toBe('rejected');
    expect((await prisma.member.findUnique({ where: { id: change.entityId } }))!.first_name).toBe(
      'Ada',
    );
  });
  it('rechecks permission and branch scope before accepting a queued write', async () => {
    const change = mutation();
    expect((await service.push({ ...viewer, permissions: [] }, userId, [change]))[0].status).toBe(
      'rejected',
    );
    expect(
      (await service.push(viewer, userId, [mutation({ branchId: otherBranch })]))[0].status,
    ).toBe('rejected');
    expect(await prisma.member.findUnique({ where: { id: change.entityId } })).toBeNull();
  });
  it('uses server versions and rejects a stale update', async () => {
    const change = mutation();
    const [created] = await service.push(viewer, userId, [change]);
    await prisma.member.update({
      where: { id: change.entityId },
      data: {
        first_name: 'Online edit',
        updated_at: new Date(Date.parse(created.version!) + 1000),
      },
    });
    const ack = await service.push(viewer, userId, [
      mutation({
        entityId: change.entityId,
        action: 'update',
        baseVersion: created.version,
        data: { firstName: 'Offline edit', lastName: 'Obi' },
      }),
    ]);
    expect(ack[0].status).toBe('conflict');
    expect((await prisma.member.findUnique({ where: { id: change.entityId } }))!.first_name).toBe(
      'Online edit',
    );
  });
  it('applies a valid update with a newer version', async () => {
    const change = mutation();
    const [created] = await service.push(viewer, userId, [change]);
    const [updated] = await service.push(viewer, userId, [
      mutation({
        entityId: change.entityId,
        action: 'update',
        baseVersion: created.version,
        data: { firstName: 'Updated', lastName: 'Obi' },
      }),
    ]);
    expect(updated.status).toBe('accepted');
    expect(Date.parse(updated.version!)).toBeGreaterThan(Date.parse(created.version!));
  });
  it('does not update a record outside the branch even if its ID is known', async () => {
    const row = await prisma.member.findFirstOrThrow({
      where: { church_id: churchId, branch_id: otherBranch },
    });
    const [ack] = await service.push(viewer, userId, [
      mutation({ entityId: row.id, action: 'update', baseVersion: row.updated_at.toISOString() }),
    ]);
    expect(ack.status).toBe('conflict');
    expect((await prisma.member.findUnique({ where: { id: row.id } }))!.first_name).toBe('Other');
  });
  it('rejects unsupported fields without creating records', async () => {
    const change = mutation({ data: { firstName: 'Ada', lastName: 'Obi', church_id: 'other' } });
    expect((await service.push(viewer, userId, [change]))[0].status).toBe('rejected');
    expect(await prisma.offlineReceipt.count({ where: { mutation_id: change.mutationId } })).toBe(
      1,
    );
    expect(await prisma.member.findUnique({ where: { id: change.entityId } })).toBeNull();
  });
  it('supports creating visitors with the verified branch', async () => {
    const change = mutation({ entity: 'visitor', data: { firstName: 'Visitor' } });
    expect((await service.push(viewer, userId, [change]))[0].status).toBe('accepted');
    expect(await prisma.visitor.findUnique({ where: { id: change.entityId } })).toMatchObject({
      branch_id: branchId,
    });
  });
  it('validates form fields, status and schema versions before submitting', async () => {
    const form = await prisma.form.create({
      data: {
        church_id: churchId,
        branch_id: branchId,
        title: 'Offline form',
        status: 'published',
        fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
      },
    });
    const change = mutation({
      entity: 'submission',
      formId: form.id,
      baseVersion: form.updated_at.toISOString(),
      data: {},
    });
    expect((await service.push(viewer, userId, [change]))[0].status).toBe('rejected');
    const valid = mutation({ ...change, mutationId: randomUUID(), data: { name: 'Ada' } });
    expect((await service.push(viewer, userId, [valid]))[0].status).toBe('accepted');
    expect((await service.push(viewer, userId, [valid]))[0].status).toBe('accepted');
    expect(await prisma.formSubmission.count({ where: { form_id: form.id } })).toBe(1);
    expect(
      (
        await service.push(viewer, userId, [
          mutation({ ...valid, mutationId: randomUUID(), entityId: randomUUID() }),
        ])
      )[0].status,
    ).toBe('conflict');
    await prisma.form.update({ where: { id: form.id }, data: { status: 'closed' } });
    expect(
      (
        await service.push(viewer, userId, [
          mutation({ ...valid, mutationId: randomUUID(), entityId: randomUUID() }),
        ])
      )[0].status,
    ).toBe('conflict');
  });
  it('continues sequentially after a rejected operation and returns individual acknowledgements', async () => {
    const invalid = mutation({ data: {} }),
      valid = mutation();
    const result = await service.push(viewer, userId, [invalid, valid]);
    expect(result.map((ack) => [ack.mutationId, ack.status])).toEqual([
      [invalid.mutationId, 'rejected'],
      [valid.mutationId, 'accepted'],
    ]);
  });
});
