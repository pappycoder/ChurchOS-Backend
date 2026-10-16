import { randomUUID, createHmac } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../src/prisma/prisma.service';
import { IntegrationAccountsService } from '../../src/integrations/integration-accounts.service';
import { ProviderTransportService } from '../../src/integrations/provider-transport.service';
import { IntegrationsController } from '../../src/integrations/integrations.controller';
import { IntegrationCallbacksController } from '../../src/integrations/integration-callbacks.controller';
import { WhatsAppService } from '../../src/whatsapp/whatsapp.service';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { PermissionsService } from '../../src/auth/services/permissions.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { AuditLoggingService } from '../../src/common/services/audit-logging.service';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import {
  DEFAULT_ROLES,
  DEFAULT_PERMISSION_MATRIX,
  generateAllPermissions,
} from '../../prisma/seeds/shared/permissions.seed';
jest.mock('jose', () => ({}));

describe('Provider accounts, independent channels and signed callbacks (PostgreSQL + HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let pool: Pool;
  const churchA = randomUUID(),
    churchB = randomUUID();
  const actor = randomUUID();
  const transport = {
    verify: jest.fn().mockResolvedValue({ status: 'verified', message: 'Account access verified' }),
    deliver: jest.fn().mockResolvedValue('external-provider-id'),
  };
  const whatsapp = { processWebhook: jest.fn().mockResolvedValue({ processed: 1 }) };
  const path = '/church/integrations';
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
  async function jsonData(response: globalThis.Response) {
    return ((await response.json()) as { data: Record<string, unknown> }).data;
  }
  async function create(
    provider: string,
    credentials: Record<string, string>,
    label = 'Test account',
  ) {
    const response = await request(`${path}/accounts`, 'POST', { provider, credentials, label });
    expect(response.status).toBe(201);
    return (await jsonData(response)) as { id: string };
  }
  async function verify(id: string) {
    expect((await request(`${path}/accounts/${id}/verify`, 'POST', {})).status).toBe(201);
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await prisma.church.createMany({
      data: [
        { id: churchA, name: 'Integration test A' },
        { id: churchB, name: 'Integration test B' },
      ],
    });
    const module = await Test.createTestingModule({
      controllers: [IntegrationsController, IntegrationCallbacksController],
      providers: [
        IntegrationAccountsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: new ConfigService({ INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32) }),
        },
        { provide: AuditLoggingService, useValue: { log: jest.fn() } },
        { provide: ProviderTransportService, useValue: transport },
        { provide: WhatsAppService, useValue: whatsapp },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication({ rawBody: true });
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const role = String(req.headers['x-test-role'] ?? '');
      if (role)
        Object.assign(req, {
          user: { sub: actor, id: actor },
          profile: {
            church_id: req.headers['x-test-church'] === 'b' ? churchB : churchA,
            role,
            roles: [role],
            is_admin_hq: req.headers['x-test-hq'] === 'true',
            permissions:
              role === 'super_admin'
                ? generateAllPermissions().map((p) => p.name)
                : role === 'readonly'
                  ? ['integrations:read']
                  : (DEFAULT_PERMISSION_MATRIX[role] ?? []),
          },
        });
      next();
    });
    app.useGlobalGuards(new PermissionsGuard(new Reflector(), {} as PermissionsService, prisma));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    app.get(ConfigService).set('PUBLIC_API_URL', base);
  });
  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.message.deleteMany({ where: { church_id: { in: [churchA, churchB] } } });
      await prisma.integrationChannel.deleteMany({
        where: { church_id: { in: [churchA, churchB] } },
      });
      await prisma.integrationAccount.deleteMany({
        where: { church_id: { in: [churchA, churchB] } },
      });
      await prisma.church.deleteMany({ where: { id: { in: [churchA, churchB] } } });
      await prisma.$disconnect();
    }
    await pool?.end();
  });
  it('rejects anonymous access and preserves status-only reads without writes', async () => {
    expect((await request(path, 'GET', undefined, '')).status).toBe(401);
    expect((await request(path, 'GET', undefined, 'readonly')).status).toBe(200);
    expect(
      (await request(`${path}/channels/email`, 'PUT', { mode: 'disabled' }, 'readonly')).status,
    ).toBe(403);
  });
  for (const { name: role } of DEFAULT_ROLES)
    for (const hq of [false, true])
      it(`restricts account administration for ${role} (HQ=${hq})`, async () => {
        expect((await request(path, 'GET', undefined, role, 'a', hq)).status).toBe(
          ['church_admin', 'super_admin'].includes(role) ? 200 : 403,
        );
        expect(
          (await request(`${path}/channels/voice`, 'PUT', { mode: 'disabled' }, role, 'a', hq))
            .status,
        ).toBe(['church_admin', 'super_admin'].includes(role) ? 200 : 403);
      });
  it('stores encrypted credentials and never returns key material in responses', async () => {
    const account = await create('resend', { apiKey: 're_private-test-key' });
    const row = await prisma.integrationAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.ciphertext).not.toContain('re_private-test-key');
    expect(await (await request(path)).text()).not.toMatch(/re_private-test-key|ciphertext/);
    expect(
      (await request(`${path}/accounts/${account.id}/verify`, 'POST', {}, 'church_admin', 'b'))
        .status,
    ).toBe(404);
    expect(
      (
        await request(
          `${path}/channels/email`,
          'PUT',
          { mode: 'custom', accountId: account.id, settings: { from: 'church@example.org' } },
          'church_admin',
          'b',
        )
      ).status,
    ).toBe(404);
  });
  it('validates provider fields, sender emails, account ownership and compatible channel capabilities', async () => {
    expect(
      (
        await request(`${path}/accounts`, 'POST', {
          provider: 'sendgrid',
          label: 'Wrong key',
          credentials: { apiKey: 're_wrong-provider' },
        })
      ).status,
    ).toBe(400);
    const account = await create('resend', { apiKey: 're_valid-test-key' });
    expect(
      (
        await request(`${path}/channels/email`, 'PUT', {
          mode: 'custom',
          accountId: account.id,
          settings: { from: 'church@example.org' },
        })
      ).status,
    ).toBe(400);
    await verify(account.id);
    expect(
      (
        await request(`${path}/channels/email`, 'PUT', {
          mode: 'custom',
          accountId: account.id,
          settings: { from: 'invalid' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`${path}/channels/whatsapp`, 'PUT', {
          mode: 'custom',
          accountId: account.id,
          settings: { from: '+12345678901' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`${path}/channels/email`, 'PUT', {
          mode: 'custom',
          accountId: account.id,
          settings: {
            from: 'church@example.org',
            replyTo: 'office@example.org',
            senderName: 'Church Office',
          },
        })
      ).status,
    ).toBe(200);
  });
  it('shares an account across SMS, WhatsApp and live calls with separate senders; channel disable does not fall back', async () => {
    const account = await create('twilio', {
      accountSid: 'AC' + 'a'.repeat(32),
      authToken: 'b'.repeat(32),
    });
    await verify(account.id);
    for (const [channel, from] of [
      ['sms', '+12345678901'],
      ['whatsapp', '+12345678902'],
      ['voice', '+12345678903'],
    ])
      expect(
        (
          await request(`${path}/channels/${channel}`, 'PUT', {
            mode: 'custom',
            accountId: account.id,
            settings: { from },
          })
        ).status,
      ).toBe(200);
    const service = app.get(IntegrationAccountsService);
    expect((await service.resolve(churchA, 'sms'))?.settings.from).toBe('+12345678901');
    expect((await service.resolve(churchA, 'whatsapp'))?.settings.from).toBe('+12345678902');
    expect((await service.resolve(churchA, 'voice'))?.settings.from).toBe('+12345678903');
    expect(
      (await request(`${path}/channels/sms/test`, 'POST', { recipient: '+2348012345678' })).status,
    ).toBe(201);
    expect((await request(`${path}/channels/sms`, 'PUT', { mode: 'disabled' })).status).toBe(200);
    await expect(service.resolve(churchA, 'sms')).rejects.toThrow('disabled');
    expect((await service.resolve(churchA, 'whatsapp'))?.accountId).toBe(account.id);
  });
  it('keeps archived merchant credentials usable only for historical settlement', async () => {
    const account = await create('paystack', { secretKey: 'sk_test_original123' });
    await verify(account.id);
    expect(
      (
        await request(`${path}/channels/payment`, 'PUT', {
          mode: 'custom',
          accountId: account.id,
          settings: {},
        })
      ).status,
    ).toBe(200);
    expect((await request(`${path}/accounts/${account.id}/archive`, 'POST', {})).status).toBe(201);
    const service = app.get(IntegrationAccountsService);
    await expect(service.resolve(churchA, 'payment')).rejects.toThrow('not found');
    expect((await service.account(churchA, account.id, true)).credentials.secretKey).toBe(
      'sk_test_original123',
    );
    await expect(service.account(churchB, account.id, true)).rejects.toThrow();
  });
  it('returns a raw Meta subscription challenge and validates tenant-bound callback signatures', async () => {
    const appSecret = 'a'.repeat(32),
      verifyToken = 'v'.repeat(32),
      phoneNumberId = '1234567890';
    const account = await create('meta', {
      accessToken: 'meta-test-token',
      appSecret,
      verifyToken,
      phoneNumberId,
    });
    await verify(account.id);
    expect(
      (
        await request(`${path}/channels/whatsapp`, 'PUT', {
          mode: 'custom',
          accountId: account.id,
          settings: {},
        })
      ).status,
    ).toBe(200);
    const challenge = await fetch(
      `${base}/integrations/webhooks/${account.id}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=12345`,
    );
    expect(await challenge.text()).toBe('12345');
    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                messages: [{ from: '2348012345678', id: 'wamid', text: { body: 'HELP' } }],
              },
            },
          ],
        },
      ],
    });
    const route = `${base}/integrations/webhooks/${account.id}`;
    const signature = 'sha256=' + createHmac('sha256', appSecret).update(payload).digest('hex');
    expect(
      (
        await fetch(route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
          body: payload,
        })
      ).status,
    ).toBe(200);
    expect(whatsapp.processWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [expect.objectContaining({ from: '+2348012345678' })] }),
      churchA,
    );
    expect(
      (
        await fetch(route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
          body: '{}',
        })
      ).status,
    ).toBe(401);
  });
  it('validates Twilio form signatures and returns raw TwiML for inbound messages', async () => {
    const authToken = 'd'.repeat(32);
    const account = await create('twilio', { accountSid: 'AC' + 'c'.repeat(32), authToken });
    await verify(account.id);
    expect(
      (
        await request(`${path}/channels/whatsapp`, 'PUT', {
          mode: 'custom',
          accountId: account.id,
          settings: { from: '+12345678901' },
        })
      ).status,
    ).toBe(200);
    const params = {
      From: 'whatsapp:+2348012345678',
      To: 'whatsapp:+12345678901',
      Body: 'HELP',
      MessageSid: 'SMtest',
    };
    const route = `${base}/integrations/webhooks/${account.id}`;
    const content =
      route +
      Object.keys(params)
        .sort()
        .map((key) => key + params[key as keyof typeof params])
        .join('');
    const signature = createHmac('sha1', authToken).update(content).digest('base64');
    const response = await fetch(route, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': signature,
      },
      body: new URLSearchParams(params),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<Response/>');
    expect(
      (
        await fetch(route, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-twilio-signature': 'wrong',
          },
          body: new URLSearchParams(params),
        })
      ).status,
    ).toBe(401);
  });

  it('enforces database browser-role denial', async () => {
    for (const table of ['integration_accounts', 'integration_channels'])
      for (const role of ['anon', 'authenticated'])
        expect(
          (
            await pool.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [
              role,
              table,
              'SELECT,INSERT,UPDATE,DELETE',
            ])
          ).rows[0].allowed,
        ).toBe(false);
  });
});
