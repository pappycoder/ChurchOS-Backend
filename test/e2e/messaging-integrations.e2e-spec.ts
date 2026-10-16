import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MessagingCredentialsService } from '../../src/messaging-integrations/messaging-credentials.service';
import { MessagingIntegrationsController } from '../../src/messaging-integrations/messaging-integrations.controller';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { ResendService } from '../../src/communication/resend.service';
import { TermiiService } from '../../src/communication/termii.service';
import { AuditLoggingService } from '../../src/common/services/audit-logging.service';
import { PermissionsService } from '../../src/auth/services/permissions.service';
import {
  DEFAULT_ROLES,
  DEFAULT_PERMISSION_MATRIX,
  generateAllPermissions,
} from '../../prisma/seeds/shared/permissions.seed';

jest.mock('jose', () => ({}));

describe('Encrypted church messaging credentials (PostgreSQL + HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pool: Pool;
  let base: string;
  const churchA = randomUUID();
  const churchB = randomUUID();
  const secret = 'private-resend-account-key';
  const audit = { log: jest.fn() };
  const email = { sendEmail: jest.fn().mockResolvedValue('message') };
  const termii = {
    sendSms: jest.fn().mockResolvedValue('message'),
    sendWhatsAppMessage: jest.fn().mockResolvedValue({ requestId: 'wa' }),
  };
  const path = '/church/messaging-integrations';
  const grants = generateAllPermissions().map((p) => p.name);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await prisma.church.createMany({
      data: [
        { id: churchA, name: 'Messaging test A' },
        { id: churchB, name: 'Messaging test B' },
      ],
    });
    const module = await Test.createTestingModule({
      controllers: [MessagingIntegrationsController],
      providers: [
        MessagingCredentialsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            MESSAGING_ENCRYPTION_KEY: 'ab'.repeat(32),
            RESEND_API_KEY: 'platform-account-key',
          }),
        },
        { provide: AuditLoggingService, useValue: audit },
        { provide: ResendService, useValue: email },
        { provide: TermiiService, useValue: termii },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const role = String(req.headers['x-test-role'] ?? '');
      if (role)
        Object.assign(req, {
          user: { sub: 'actor', id: 'actor' },
          profile: {
            church_id: req.headers['x-test-church'] === 'b' ? churchB : churchA,
            role,
            roles: [role],
            is_admin_hq: req.headers['x-test-hq'] === 'true',
            permissions:
              role === 'super_admin'
                ? grants
                : role === 'readonly'
                  ? ['messaging_integrations:read']
                  : (DEFAULT_PERMISSION_MATRIX[role] ?? []),
          },
        });
      next();
    });
    app.useGlobalGuards(new PermissionsGuard(new Reflector(), {} as PermissionsService, prisma));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.church.deleteMany({ where: { id: { in: [churchA, churchB] } } });
      await prisma.$disconnect();
    }
    await pool?.end();
  });

  const request = (
    route: string,
    method = 'GET',
    body?: unknown,
    role = 'church_admin',
    church = 'a',
    hq = false,
  ) =>
    fetch(`${base}${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-test-role': role,
        'x-test-church': church,
        'x-test-hq': String(hq),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const config = { mode: 'custom', apiKey: secret, from: 'church@example.org' };

  it('rejects anonymous access', async () => {
    expect((await request(path, 'GET', undefined, '')).status).toBe(401);
  });
  for (const { name: role } of DEFAULT_ROLES)
    for (const hq of [false, true]) {
      it(`enforces integration management for ${role} (HQ=${hq})`, async () => {
        const allowed = ['church_admin', 'super_admin'].includes(role);
        expect((await request(`${path}/resend`, 'PUT', config, role, 'a', hq)).status).toBe(
          allowed ? 200 : 403,
        );
        expect((await request(path, 'GET', undefined, role, 'a', hq)).status).toBe(
          allowed ? 200 : 403,
        );
      });
    }
  it('permits status-only access without allowing credential changes or paid tests', async () => {
    expect((await request(path, 'GET', undefined, 'readonly')).status).toBe(200);
    expect((await request(`${path}/resend`, 'PUT', config, 'readonly')).status).toBe(403);
    expect(
      (
        await request(
          `${path}/resend/test`,
          'POST',
          { channel: 'email', recipient: 'test@example.org' },
          'readonly',
        )
      ).status,
    ).toBe(403);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
  it('persists only ciphertext, returns safe status, and scopes reads by authenticated church', async () => {
    const response = await request(`${path}/resend`, 'PUT', config);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/private-resend|ciphertext|church@example/);
    const row = await prisma.messagingIntegration.findUniqueOrThrow({
      where: { church_id_provider: { church_id: churchA, provider: 'resend' } },
    });
    expect(row.ciphertext).not.toContain(secret);
    const statusB = (await (await request(path, 'GET', undefined, 'church_admin', 'b')).json()) as {
      provider: string;
      mode: string;
    }[];
    expect(statusB.find((row) => row.provider === 'resend')?.mode).toBe('platform');
    const resolver = app.get(MessagingCredentialsService);
    expect((await resolver.resolve(churchA, 'resend')).apiKey).toBe(secret);
    expect((await resolver.resolve(churchB, 'resend')).apiKey).toBe('platform-account-key');
  });
  it('rejects mass-assignment, invalid provider/channel, and incomplete configurations', async () => {
    for (const body of [
      { ...config, churchId: churchB },
      { ...config, mode: 'other' },
      { mode: 'custom' },
      { ...config, apiKey: 'too short' },
    ])
      expect((await request(`${path}/resend`, 'PUT', body)).status).toBe(400);
    expect((await request(`${path}/unknown`, 'PUT', config)).status).toBe(400);
    expect(
      (
        await request(`${path}/termii/test`, 'POST', {
          channel: 'email',
          recipient: 'test@example.org',
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(`${path}/resend/test`, 'POST', { channel: 'email', recipient: '<script>' }))
        .status,
    ).toBe(400);
  });
  it('tests the saved account with a scoped recipient and safely disables/removes credentials', async () => {
    expect(
      (
        await request(`${path}/resend/test`, 'POST', {
          channel: 'email',
          recipient: 'test@example.org',
        })
      ).status,
    ).toBe(201);
    expect(email.sendEmail).toHaveBeenCalledWith(
      'test@example.org',
      expect.any(String),
      expect.any(String),
      churchA,
    );
    expect((await request(`${path}/resend`, 'PUT', { mode: 'disabled' })).status).toBe(200);
    await expect(app.get(MessagingCredentialsService).resolve(churchA, 'resend')).rejects.toThrow(
      'disabled',
    );
    const row = await prisma.messagingIntegration.findUniqueOrThrow({
      where: { church_id_provider: { church_id: churchA, provider: 'resend' } },
    });
    expect(row.ciphertext).toBeNull();
  });
  it('blocks browser database roles and enforces database constraints', async () => {
    const result = await pool.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'messaging_integrations'::regclass",
    );
    expect(result.rows[0].relrowsecurity).toBe(true);
    for (const role of ['anon', 'authenticated']) {
      const access = await pool.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [
        role,
        'messaging_integrations',
        'SELECT,INSERT,UPDATE,DELETE',
      ]);
      expect(access.rows[0].allowed).toBe(false);
    }
    await expect(
      pool.query(
        'INSERT INTO messaging_integrations (church_id, provider, mode) VALUES ($1,$2,$3)',
        [churchB, 'resend', 'custom'],
      ),
    ).rejects.toThrow();
  });
});
