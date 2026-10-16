import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { MessagingCredentialsService } from '../../../src/messaging-integrations/messaging-credentials.service';

const churchA = '11111111-1111-4111-8111-111111111111';
const churchB = '22222222-2222-4222-8222-222222222222';
const keyA = 'resend-church-a-private-key';
const configValues: Record<string, string> = {
  MESSAGING_ENCRYPTION_KEY: 'ab'.repeat(32),
  RESEND_API_KEY: 'platform-resend-key',
  RESEND_FROM: 'platform@example.org',
  TERMII_API_KEY: 'platform-termii-key',
  TERMII_DEFAULT_CHURCH_ID: churchA,
};

describe('Messaging credential security and account selection', () => {
  let service: MessagingCredentialsService;
  let rows: Map<
    string,
    {
      church_id: string;
      provider: string;
      mode: string;
      ciphertext: string | null;
      updated_at: Date;
    }
  >;
  let audit: { log: jest.Mock };
  let prisma: {
    messagingIntegration: { findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
  };
  let config: Record<string, string>;
  beforeEach(() => {
    config = { ...configValues };
    rows = new Map();
    audit = { log: jest.fn() };
    prisma = {
      messagingIntegration: {
        findUnique: jest.fn(
          ({ where }) =>
            rows.get(
              `${where.church_id_provider.church_id}:${where.church_id_provider.provider}`,
            ) ?? null,
        ),
        findMany: jest.fn(({ where }) =>
          [...rows.values()].filter((row) => row.church_id === where.church_id),
        ),
        upsert: jest.fn(({ create }) => {
          rows.set(`${create.church_id}:${create.provider}`, { ...create, updated_at: new Date() });
        }),
      },
    };
    service = new MessagingCredentialsService(
      prisma as unknown as PrismaService,
      { get: (key: string, fallback?: string) => config[key] ?? fallback } as ConfigService,
      audit as unknown as AuditLoggingService,
    );
  });

  it('encrypts with random nonces and authenticates tenant and provider context', () => {
    const value = { apiKey: keyA, from: 'church@example.org' };
    const one = service.encrypt(churchA, 'resend', value);
    const two = service.encrypt(churchA, 'resend', value);
    expect(one).not.toEqual(two);
    expect(one).not.toContain(keyA);
    expect(service.decrypt(churchA, 'resend', one)).toEqual(value);
    expect(() => service.decrypt(churchB, 'resend', one)).toThrow(ServiceUnavailableException);
    expect(() => service.decrypt(churchA, 'termii', one)).toThrow(ServiceUnavailableException);
    const parts = one.split('.');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => service.decrypt(churchA, 'resend', parts.join('.'))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('fails closed for missing or wrong encryption keys', () => {
    const value = service.encrypt(churchA, 'resend', { apiKey: keyA });
    delete config.MESSAGING_ENCRYPTION_KEY;
    expect(() => service.encrypt(churchA, 'resend', { apiKey: keyA })).toThrow();
    expect(() => service.decrypt(churchA, 'resend', value)).toThrow();
    config.MESSAGING_ENCRYPTION_KEY = 'cd'.repeat(32);
    expect(() => service.decrypt(churchA, 'resend', value)).toThrow();
  });

  it('isolates church accounts and exposes only safe status and audit data', async () => {
    const status = await service.save(
      churchA,
      'resend',
      'custom',
      { apiKey: keyA, from: 'church@example.org' },
      'actor',
    );
    expect(await service.resolve(churchA, 'resend')).toEqual({
      apiKey: keyA,
      from: 'church@example.org',
    });
    expect((await service.resolve(churchB, 'resend')).apiKey).toBe('platform-resend-key');
    expect(prisma.messagingIntegration.findUnique).toHaveBeenCalledWith({
      where: { church_id_provider: { church_id: churchB, provider: 'resend' } },
    });
    expect(JSON.stringify([status, audit.log.mock.calls])).not.toMatch(
      /private-key|ciphertext|church@example/,
    );
    expect(JSON.stringify([...rows.values()])).not.toContain(keyA);
  });

  it('rotates credentials atomically and removes them when disabling or explicitly selecting platform', async () => {
    await service.save(
      churchA,
      'resend',
      'custom',
      { apiKey: keyA, from: 'church@example.org' },
      'actor',
    );
    await service.save(
      churchA,
      'resend',
      'custom',
      { apiKey: 'rotated-key', from: 'new@example.org' },
      'actor',
    );
    expect((await service.resolve(churchA, 'resend')).apiKey).toBe('rotated-key');
    await service.save(churchA, 'resend', 'disabled', {}, 'actor');
    await expect(service.resolve(churchA, 'resend')).rejects.toThrow('disabled');
    expect(rows.get(`${churchA}:resend`)?.ciphertext).toBeNull();
    await service.save(churchA, 'resend', 'platform', {}, 'actor');
    expect((await service.resolve(churchA, 'resend')).apiKey).toBe('platform-resend-key');
  });

  it('never falls back on corrupted custom credentials or database failures', async () => {
    await service.save(
      churchA,
      'resend',
      'custom',
      { apiKey: keyA, from: 'church@example.org' },
      'actor',
    );
    rows.get(`${churchA}:resend`)!.ciphertext = 'broken';
    await expect(service.resolve(churchA, 'resend')).rejects.toThrow('cannot be decrypted');
    prisma.messagingIntegration.findUnique.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(service.resolve(churchB, 'resend')).rejects.toThrow('Database unavailable');
  });

  it('uses platform email for authentication without accessing tenant credentials', async () => {
    expect((await service.resolve('', 'resend')).apiKey).toBe('platform-resend-key');
    expect(prisma.messagingIntegration.findUnique).not.toHaveBeenCalled();
    await expect(service.resolve('', 'termii')).rejects.toThrow('church is required');
  });

  it.each([
    ['resend', { apiKey: keyA, from: 'not-email' }],
    ['resend', { apiKey: 'bad key with spaces', from: 'ok@example.org' }],
    ['termii', { apiKey: 'termii-valid-key', from: 'sender', deviceId: 'device' }],
  ] as const)('rejects incomplete or unsafe %s configuration', async (provider, input) => {
    await expect(service.save(churchA, provider, 'custom', input, 'actor')).rejects.toThrow();
    expect(prisma.messagingIntegration.upsert).not.toHaveBeenCalled();
  });

  it('allows only known HTTPS Termii origins, preventing custom credential exfiltration', async () => {
    expect(service.termiiBaseUrl('https://api.ng.termii.com')).toBe('https://api.ng.termii.com');
    for (const url of [
      'http://127.0.0.1',
      'https://api.termii.com.evil.example',
      'https://api.termii.com@evil.example',
      'https://api.termii.com/path',
      'https://api.termii.com:8443',
    ]) {
      expect(() => service.termiiBaseUrl(url)).toThrow();
      await expect(
        service.save(
          churchA,
          'termii',
          'custom',
          { apiKey: 'termii-key', from: 'Church', baseUrl: url },
          'actor',
        ),
      ).rejects.toThrow();
    }
    expect(prisma.messagingIntegration.upsert).not.toHaveBeenCalled();
  });

  it('rejects unknown providers and credentials submitted with platform mode', async () => {
    expect(() => service.provider('other')).toThrow();
    await expect(
      service.save(churchA, 'resend', 'platform', { apiKey: keyA }, 'actor'),
    ).rejects.toThrow();
  });

  it('only enables tenant webhooks for custom accounts and restricts the platform endpoint to its configured church', async () => {
    await expect(service.webhookCredentials(churchA)).rejects.toThrow();
    expect(await service.platformWebhookChurch()).toBe(churchA);
    const input = {
      apiKey: 'termii-private-key',
      from: 'Church',
      deviceId: 'device',
      webhookSecret: 's'.repeat(32),
      verifyToken: 'v'.repeat(24),
    };
    await service.save(churchA, 'termii', 'custom', input, 'actor');
    expect(await service.webhookCredentials(churchA)).toEqual({
      ...input,
      baseUrl: 'https://api.termii.com',
    });
    await expect(service.webhookCredentials(churchB)).rejects.toThrow();
    await expect(service.platformWebhookChurch()).rejects.toThrow('disabled');
    await service.save(churchA, 'termii', 'disabled', {}, 'actor');
    await expect(service.webhookCredentials(churchA)).rejects.toThrow();
  });
});
