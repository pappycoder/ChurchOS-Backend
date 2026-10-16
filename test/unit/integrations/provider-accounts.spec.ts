import { ConfigService } from '@nestjs/config';
import { IntegrationAccountsService } from '../../../src/integrations/integration-accounts.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { ProviderTransportService } from '../../../src/integrations/provider-transport.service';
import { PaymentAccountsService } from '../../../src/giving/services/payment-accounts.service';
import { PaystackService } from '../../../src/giving/services/paystack.service';
import { FlutterwaveService } from '../../../src/giving/services/flutterwave.service';

describe('Provider account isolation and historical payment credentials', () => {
  const key = 'ab'.repeat(32);
  const make = () =>
    new IntegrationAccountsService(
      {} as PrismaService,
      new ConfigService({ INTEGRATIONS_ENCRYPTION_KEY: key }),
      {} as AuditLoggingService,
      {} as ProviderTransportService,
    );
  it('binds authenticated encryption to church, account version and provider', () => {
    const service = make();
    const secret = { apiKey: 'private-api-key' };
    const cipher = service.encrypt('church-a', 'account-a', 'resend', secret);
    expect(cipher).not.toContain(secret.apiKey);
    expect(service.decrypt('church-a', 'account-a', 'resend', cipher)).toEqual(secret);
    expect(() => service.decrypt('church-b', 'account-a', 'resend', cipher)).toThrow();
    expect(() => service.decrypt('church-a', 'account-b', 'resend', cipher)).toThrow();
    expect(() => service.decrypt('church-a', 'account-a', 'twilio', cipher)).toThrow();
  });
  it('validates channel-specific sender settings and rejects secret fields in public settings', () => {
    const service = make();
    expect(
      service.settings('resend', 'email', {
        from: 'office@example.org',
        replyTo: 'pastor@example.org',
        senderName: 'Church Office',
      }),
    ).toMatchObject({ from: 'office@example.org' });
    expect(() => service.settings('resend', 'email', { from: 'invalid' })).toThrow();
    expect(() => service.settings('twilio', 'voice', { from: '<Dial>bad</Dial>' })).toThrow();
    expect(() =>
      service.settings('resend', 'email', { from: 'ok@example.org', apiKey: 'leaked-key' }),
    ).toThrow();
  });
  it('pins historical payments to their merchant after channel changes, and rejects cross-provider accounts', async () => {
    const config = new ConfigService({ PAYSTACK_SECRET_KEY: 'platform' });
    const accounts = {
      resolve: jest.fn().mockResolvedValue({
        provider: 'flutterwave',
        accountId: 'new-account',
        credentials: { secretKey: 'FLWSECK_TEST-new-X', webhookSecret: 'hash' },
      }),
      account: jest.fn().mockResolvedValue({
        provider: 'paystack',
        credentials: { secretKey: 'sk_test_original' },
      }),
    };
    const service = new PaymentAccountsService(
      accounts as unknown as IntegrationAccountsService,
      new PaystackService(config),
      new FlutterwaveService(config),
    );
    expect(await service.defaultGateway('church-a')).toBe('flutterwave');
    await expect(service.current('church-a', 'paystack')).rejects.toThrow('not enabled');
    const historical = await service.historical('church-a', 'paystack', 'old-account');
    expect(accounts.account).toHaveBeenCalledWith('church-a', 'old-account', true);
    expect(historical.isConfigured()).toBe(true);
    await expect(service.historical('church-a', 'flutterwave', 'old-account')).rejects.toThrow(
      'does not match',
    );
  });
  it('verifies Flutterwave v3 secret hashes and modern signed payloads using the separate webhook secret', () => {
    const hash = 'separate-webhook-secret';
    const service = new FlutterwaveService(
      new ConfigService({
        FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-valid-X',
        FLUTTERWAVE_WEBHOOK_SECRET: hash,
      }),
    );
    expect(service.validateWebhookSignature('{}', hash)).toBe(true);
    expect(service.validateWebhookSignature('{}', 'wrong')).toBe(false);
  });
});
