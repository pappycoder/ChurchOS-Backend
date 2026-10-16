import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RequestContextService } from '../../src/common/services/request-context.service';
import { BranchScopeService } from '../../src/common/services/branch-scope.service';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { CacheInterceptor } from '../../src/common/interceptors/cache.interceptor';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { MembersController } from '../../src/members/members.controller';
import { MembersService } from '../../src/members/members.service';
import { VisitorsController } from '../../src/visitors/visitors.controller';
import { VisitorsService } from '../../src/visitors/visitors.service';
import { FormsController } from '../../src/forms/forms.controller';
import { FormsService } from '../../src/forms/forms.service';
import { AssetsController } from '../../src/assets/assets.controller';
import { AssetsService } from '../../src/assets/assets.service';
import { FamilyController } from '../../src/family/family.controller';
import { FamilyService } from '../../src/family/family.service';
import { AttendanceController } from '../../src/attendance/attendance.controller';
import { AttendanceService } from '../../src/attendance/attendance.service';
import {
  DEFAULT_ROLES,
  DEFAULT_PERMISSION_MATRIX,
  generateAllPermissions,
} from '../../prisma/seeds/shared/permissions.seed';

// Identity is an explicit test fixture only. Production controllers, DTOs,
// permission guard, services, tenant context and PostgreSQL are used unchanged.
// Existing live-password logins are exercised separately by the browser audit.
jest.mock('jose', () => ({}));

interface Resource {
  route: string;
  model: 'member' | 'visitor' | 'form' | 'asset' | 'family' | 'service';
  idKey: string;
  create: string;
  read: string;
  update: string;
  delete: string;
  body: Record<string, unknown>;
  patch: Record<string, unknown>;
  seed: Record<string, unknown>;
  restore?: string;
}

const resources: Resource[] = [
  {
    route: 'members',
    model: 'member',
    idKey: 'memberId',
    create: 'members:new:create',
    read: 'members:all:read',
    update: 'members:all:update',
    delete: 'members:all:delete',
    body: { firstName: 'Created', lastName: 'Acceptance' },
    patch: { firstName: 'Edited' },
    seed: { first_name: 'Initial', last_name: 'Acceptance' },
    restore: 'restore-archive',
  },
  {
    route: 'visitors',
    model: 'visitor',
    idKey: 'id',
    create: 'visitors:new:create',
    read: 'visitors:list:read',
    update: 'visitors:list:update',
    delete: 'visitors:list:delete',
    body: { firstName: 'Created', lastName: 'Acceptance' },
    patch: { firstName: 'Edited' },
    seed: { first_name: 'Initial', last_name: 'Acceptance', first_visit_date: new Date() },
  },
  {
    route: 'forms',
    model: 'form',
    idKey: 'id',
    create: 'forms:list:create',
    read: 'forms:list:read',
    update: 'forms:list:update',
    delete: 'forms:list:delete',
    body: { title: 'Created', fields: [{ key: 'answer', label: 'Answer', type: 'text' }] },
    patch: { title: 'Edited' },
    seed: { title: 'Initial', fields: [{ key: 'answer', label: 'Answer', type: 'text' }] },
  },
  {
    route: 'assets',
    model: 'asset',
    idKey: 'id',
    create: 'assets:list:create',
    read: 'assets:list:read',
    update: 'assets:list:update',
    delete: 'assets:list:delete',
    body: { name: 'Created' },
    patch: { name: 'Edited' },
    seed: { name: 'Initial' },
  },
  {
    route: 'families',
    model: 'family',
    idKey: 'familyId',
    create: 'families:create',
    read: 'families:read',
    update: 'families:update',
    delete: 'families:delete',
    body: { name: 'Created' },
    patch: { name: 'Edited' },
    seed: { name: 'Initial' },
  },
  {
    route: 'services',
    model: 'service',
    idKey: 'serviceId',
    create: 'attendance:services:create',
    read: 'attendance:services:read',
    update: 'attendance:services:update',
    delete: 'attendance:services:delete',
    body: { name: 'Created' },
    patch: { name: 'Edited' },
    seed: { name: 'Initial' },
  },
];
interface Delegate {
  create(input: {
    data: Record<string, unknown>;
  }): Promise<Record<string, unknown> & { id: string }>;
  findUnique(input: { where: { id: string } }): Promise<Record<string, unknown> | null>;
  deleteMany(input: { where: { church_id: { in: string[] } } }): Promise<unknown>;
}

describe('all-role CRUD with isolated PostgreSQL', () => {
  const prisma = new PrismaService();
  const context = new RequestContextService();
  const scope = new BranchScopeService(context);
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const churchId = randomUUID(),
    foreignChurchId = randomUUID(),
    branchId = randomUUID(),
    otherBranchId = randomUUID(),
    foreignBranchId = randomUUID(),
    userId = randomUUID();
  const catalog = generateAllPermissions().map((permission) => permission.name);
  const roles = DEFAULT_ROLES.flatMap(({ name }) =>
    [false, true].map((hq) => ({
      role: name,
      hq,
      grants: name === 'super_admin' ? catalog : DEFAULT_PERMISSION_MATRIX[name],
    })),
  );
  let app: INestApplication;
  let origin: string;
  const delegate = (resource: Resource) => prisma[resource.model] as unknown as Delegate;
  const call = async (
    role: string,
    hq: boolean,
    method: string,
    route: string,
    body?: Record<string, unknown>,
  ) => {
    const response = await fetch(`${origin}/api/v1/${route}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-acceptance-role': role,
        'x-acceptance-hq': String(hq),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  };
  const seed = (resource: Resource, branch = branchId, church = churchId) =>
    delegate(resource).create({
      data: {
        church_id: church,
        branch_id: branch,
        ...resource.seed,
        ...(resource.model === 'asset' ? { asset_tag: randomUUID() } : {}),
      },
    });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.church.createMany({
      data: [
        { id: churchId, name: 'Isolated role acceptance' },
        { id: foreignChurchId, name: 'Isolated foreign tenant' },
      ],
    });
    await prisma.branch.createMany({
      data: [
        { id: branchId, church_id: churchId, name: 'Own branch' },
        { id: otherBranchId, church_id: churchId, name: 'Other branch' },
        { id: foreignBranchId, church_id: foreignChurchId, name: 'Foreign branch' },
      ],
    });
    const module = await Test.createTestingModule({
      controllers: [
        MembersController,
        VisitorsController,
        FormsController,
        AssetsController,
        FamilyController,
        AttendanceController,
      ],
      providers: [
        {
          provide: MembersService,
          useValue: new MembersService(
            prisma,
            context,
            audit as never,
            { createNotification: jest.fn() } as never,
            scope,
          ),
        },
        {
          provide: VisitorsService,
          useValue: new VisitorsService(prisma, audit as never, context),
        },
        { provide: FormsService, useValue: new FormsService(prisma, audit as never, scope) },
        { provide: AssetsService, useValue: new AssetsService(prisma, context, audit as never) },
        { provide: FamilyService, useValue: new FamilyService(prisma, audit as never, scope) },
        {
          provide: AttendanceService,
          useValue: new AttendanceService(prisma, context, audit as never, scope),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CacheInterceptor)
      .useValue({ intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle() })
      .compile();
    app = module.createNestApplication({ logger: ['error'] });
    app.use((request: Request, _response: Response, next: NextFunction) => {
      const role = String(request.headers['x-acceptance-role']);
      const grants =
        role === 'custom_readonly'
          ? catalog.filter((permission) => /:(read|view)$/.test(permission))
          : (roles.find((candidate) => candidate.role === role)?.grants ?? []);
      const viewer = {
        id: randomUUID(),
        church_id: churchId,
        branch_id: branchId,
        role,
        roles: [role],
        permissions: grants,
        is_admin_hq: request.headers['x-acceptance-hq'] === 'true',
      };
      Object.assign(request, { user: { sub: userId, id: userId }, profile: viewer });
      context.run({ userId, churchId, branchId, role, viewer }, next);
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalGuards(new PermissionsGuard(new Reflector(), {} as never, prisma));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    for (const model of [
      'formSubmission',
      'form',
      'asset',
      'family',
      'attendance',
      'service',
      'visitor',
      'member',
      'auditLog',
      'syncQueue',
      'branch',
    ] as const) {
      await (prisma[model] as unknown as Delegate).deleteMany({
        where: { church_id: { in: [churchId, foreignChurchId] } },
      });
    }
    await prisma.church.deleteMany({ where: { id: { in: [churchId, foreignChurchId] } } });
    await prisma.$disconnect();
  });

  it.each(roles)(
    '$role HQ=$hq enforces permitted and denied mutations with persisted effects',
    async ({ role, hq, grants }) => {
      for (const resource of resources) {
        const own = await seed(resource);
        const crossBranch = await seed(resource, otherBranchId);
        const foreign = await seed(resource, foreignBranchId, foreignChurchId);
        const payload = {
          ...resource.body,
          branchId,
          ...(resource.model === 'asset' ? { assetTag: randomUUID() } : {}),
        };
        const created = await call(role, hq, 'POST', resource.route, payload);
        expect({ route: resource.route, status: created.status }).toEqual({
          route: resource.route,
          status: grants.includes(resource.create) ? 201 : 403,
        });
        if (grants.includes(resource.create)) {
          const id = created.data.data?.[resource.idKey] ?? created.data.data?.id;
          expect(id).toBeDefined();
          expect(await delegate(resource).findUnique({ where: { id } })).toMatchObject({
            church_id: churchId,
            branch_id: branchId,
          });
        }
        const updated = await call(
          role,
          hq,
          'PATCH',
          `${resource.route}/${own.id}`,
          resource.patch,
        );
        expect({ route: resource.route, status: updated.status }).toEqual({
          route: resource.route,
          status: grants.includes(resource.update) ? 200 : 403,
        });
        const property =
          resource.model === 'member' || resource.model === 'visitor'
            ? 'first_name'
            : resource.model === 'form'
              ? 'title'
              : 'name';
        expect((await delegate(resource).findUnique({ where: { id: own.id } }))?.[property]).toBe(
          grants.includes(resource.update) ? 'Edited' : 'Initial',
        );
        if (grants.includes(resource.read)) {
          expect((await call(role, hq, 'GET', `${resource.route}/${own.id}`)).status).toBe(200);
          expect((await call(role, hq, 'GET', `${resource.route}/${crossBranch.id}`)).status).toBe(
            hq ? 200 : 404,
          );
          expect((await call(role, hq, 'GET', `${resource.route}/${foreign.id}`)).status).toBe(404);
        }
        const archived = await call(role, hq, 'POST', `${resource.route}/${own.id}/archive`, {});
        expect(grants.includes(resource.update) ? [200, 201] : [403]).toContain(archived.status);
        expect(
          !!(await delegate(resource).findUnique({ where: { id: own.id } }))?.archived_at,
        ).toBe(grants.includes(resource.update));
        if (grants.includes(resource.update))
          expect([200, 201]).toContain(
            (
              await call(
                role,
                hq,
                'POST',
                `${resource.route}/${own.id}/${resource.restore ?? 'restore'}`,
                {},
              )
            ).status,
          );
        const removed = await call(role, hq, 'DELETE', `${resource.route}/${own.id}`);
        expect(grants.includes(resource.delete) ? [200, 204] : [403]).toContain(removed.status);
        if (!grants.includes(resource.delete))
          expect(await delegate(resource).findUnique({ where: { id: own.id } })).not.toBeNull();
        const foreignWrite = await call(
          role,
          hq,
          'PATCH',
          `${resource.route}/${foreign.id}`,
          resource.patch,
        );
        expect(foreignWrite.status).toBe(grants.includes(resource.update) ? 404 : 403);
        const crossWrite = await call(
          role,
          hq,
          'PATCH',
          `${resource.route}/${crossBranch.id}`,
          resource.patch,
        );
        expect({ route: resource.route, status: crossWrite.status }).toEqual({
          route: resource.route,
          status: grants.includes(resource.update) ? (hq ? 200 : 404) : 403,
        });
      }
    },
    45000,
  );

  it('lets read-only HQ viewers read but rejects every definition mutation without touching rows', async () => {
    for (const resource of resources) {
      const own = await seed(resource);
      expect(
        (await call('custom_readonly', true, 'GET', `${resource.route}/${own.id}`)).status,
      ).toBe(200);
      const payload = {
        ...resource.body,
        branchId,
        ...(resource.model === 'asset' ? { assetTag: randomUUID() } : {}),
      };
      expect((await call('custom_readonly', true, 'POST', resource.route, payload)).status).toBe(
        403,
      );
      expect(
        (
          await call(
            'custom_readonly',
            true,
            'PATCH',
            `${resource.route}/${own.id}`,
            resource.patch,
          )
        ).status,
      ).toBe(403);
      expect(
        (await call('custom_readonly', true, 'POST', `${resource.route}/${own.id}/archive`, {}))
          .status,
      ).toBe(403);
      expect(
        (await call('custom_readonly', true, 'DELETE', `${resource.route}/${own.id}`)).status,
      ).toBe(403);
      expect(await delegate(resource).findUnique({ where: { id: own.id } })).toMatchObject({
        ...resource.seed,
        archived_at: null,
      });
    }
  });

  it('rejects HQ form assignment to another church before creating a row', async () => {
    const before = await prisma.form.count({ where: { church_id: churchId } });
    expect(
      (
        await call('church_admin', true, 'POST', 'forms', {
          title: 'Invalid branch',
          fields: [],
          branchId: foreignBranchId,
        })
      ).status,
    ).toBe(404);
    expect(await prisma.form.count({ where: { church_id: churchId } })).toBe(before);
  });

  it('pins branch-created forms to the actor branch despite a foreign branch input', async () => {
    const created = await call('secretary', false, 'POST', 'forms', {
      title: 'Pinned branch',
      fields: [],
      branchId: foreignBranchId,
    });
    expect(created.status).toBe(201);
    expect(await prisma.form.findUnique({ where: { id: created.data.data.id } })).toMatchObject({
      church_id: churchId,
      branch_id: branchId,
    });
  });

  it.each(['clone', 'archive', 'restore', 'regenerate-link', 'close', 'reopen', 'submit'])(
    'rejects cross-branch form %s before any change is persisted',
    async (action) => {
      const form = await prisma.form.create({
        data: {
          church_id: churchId,
          branch_id: otherBranchId,
          title: 'Other branch',
          status: 'published',
          fields: [],
        },
      });
      const response = await call(
        'church_admin',
        false,
        'POST',
        `forms/${form.id}/${action}`,
        action === 'submit' ? { data: {} } : {},
      );
      expect(response.status).toBe(404);
      expect(await prisma.form.findUnique({ where: { id: form.id } })).toMatchObject({
        title: 'Other branch',
        status: 'published',
        archived_at: null,
      });
      expect(await prisma.formSubmission.count({ where: { form_id: form.id } })).toBe(0);
    },
  );

  it('prevents cross-branch submission viewing and review, while allowing HQ review', async () => {
    const form = await prisma.form.create({
      data: {
        church_id: churchId,
        branch_id: otherBranchId,
        title: 'Other branch',
        status: 'published',
        fields: [],
      },
    });
    const submission = await prisma.formSubmission.create({
      data: { church_id: churchId, form_id: form.id, data: {} },
    });
    const endpoint = `forms/${form.id}/submissions/${submission.id}`;
    expect((await call('church_admin', false, 'GET', endpoint)).status).toBe(404);
    expect(
      (await call('church_admin', false, 'PATCH', `${endpoint}/status`, { status: 'approved' }))
        .status,
    ).toBe(404);
    expect((await prisma.formSubmission.findUnique({ where: { id: submission.id } }))?.status).toBe(
      'pending',
    );
    expect((await call('church_admin', true, 'GET', endpoint)).status).toBe(200);
    expect(
      (await call('church_admin', true, 'PATCH', `${endpoint}/status`, { status: 'approved' }))
        .status,
    ).toBe(200);
    expect((await prisma.formSubmission.findUnique({ where: { id: submission.id } }))?.status).toBe(
      'approved',
    );
  });

  it.each([branchId, null])(
    'keeps branch-owned copies of permitted templates in the current branch (source=%s)',
    async (sourceBranch) => {
      const form = await prisma.form.create({
        data: { church_id: churchId, branch_id: sourceBranch, title: 'Template', fields: [] },
      });
      const copied = await call('secretary', false, 'POST', `forms/${form.id}/clone`, {});
      expect(copied.status).toBe(201);
      expect(await prisma.form.findUnique({ where: { id: copied.data.data.id } })).toMatchObject({
        branch_id: branchId,
        church_id: churchId,
        title: 'Template (Copy)',
      });
    },
  );
});
