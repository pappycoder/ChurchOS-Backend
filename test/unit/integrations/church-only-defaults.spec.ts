import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { IntegrationAccountsService } from '../../../src/integrations/integration-accounts.service';
import { EmailDeliveryService } from '../../../src/communication/email-delivery.service';
import { MessagingDeliveryService } from '../../../src/communication/messaging-delivery.service';
import { PaymentAccountsService } from '../../../src/giving/services/payment-accounts.service';
import { CHANNELS } from '../../../src/integrations/provider-catalog';
import { BroadcastService } from '../../../src/broadcast/broadcast.service';
import { GivingService } from '../../../src/giving/giving.service';

describe('Church-owned integration defaults', () => {
  const config = new ConfigService({
    INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32),
    RESEND_API_KEY: 'organization-email-key',
    RESEND_FROM: 'organization@example.org',
    TERMII_API_KEY: 'organization-sms-key',
    PAYSTACK_SECRET_KEY: 'organization-payment-key',
  });
  let prisma: Record<string, { [key: string]: jest.Mock }>;
  let transport: { deliver: jest.Mock };
  let accounts: IntegrationAccountsService;
  let email: EmailDeliveryService;
  let sms: MessagingDeliveryService;
  let fetcher: jest.SpyInstance;
  beforeEach(() => {
    prisma = {
      integrationChannel: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      integrationAccount: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      message: { create: jest.fn().mockResolvedValue({ id: 'message-id' }) },
    };
    transport = { deliver: jest.fn().mockResolvedValue('provider-id') };
    accounts = new IntegrationAccountsService(
      prisma as never,
      config,
      { log: jest.fn() } as never,
      transport as never,
    );
    const moduleRef = { get: jest.fn() } as unknown as ModuleRef;
    email = new EmailDeliveryService(prisma as never, moduleRef, config, accounts);
    sms = new MessagingDeliveryService(prisma as never, accounts);
    fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'organization-message' }), { status: 200 }),
      );
  });

  it.each(CHANNELS)(
    'blocks unconfigured and disabled %s even when environment keys exist',
    async (kind) => {
      for (const row of [null, { mode: 'disabled' }]) {
        prisma.integrationChannel.findUnique.mockResolvedValue(row);
        await expect(accounts.resolve('church-a', kind)).rejects.toThrow('disabled');
      }
      expect(fetcher).not.toHaveBeenCalled();
      expect(transport.deliver).not.toHaveBeenCalled();
    },
  );

  it('does not contact providers or log sent messages for a church without accounts', async () => {
    await expect(
      email.sendEmail('member@example.org', 'Hello', 'Message', 'church-a'),
    ).rejects.toThrow('disabled');
    await expect(sms.sendSms('+2348012345678', 'Message', 'church-a')).rejects.toThrow('disabled');
    await expect(sms.sendWhatsAppMessage('+2348012345678', 'Message', 'church-a')).rejects.toThrow(
      'disabled',
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('uses the selected encrypted church account and sender for external email', async () => {
    prisma.integrationChannel.findUnique.mockResolvedValue({
      mode: 'custom',
      account_id: 'account-a',
      settings: { from: 'office@church.example', senderName: 'Church Office' },
    });
    prisma.integrationAccount.findFirst.mockResolvedValue({
      id: 'account-a',
      provider: 'resend',
      ciphertext: accounts.encrypt('church-a', 'account-a', 'resend', {
        apiKey: 'church-owned-email-key',
      }),
    });
    await email.sendEmail('member@example.org', 'Hello', 'Message', 'church-a');
    expect(transport.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-a',
        credentials: { apiKey: 'church-owned-email-key' },
      }),
      'email',
      expect.objectContaining({ from: 'office@church.example' }),
    );
    expect(prisma.integrationAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account-a', church_id: 'church-a', archived_at: null },
      }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps platform authentication emails explicit and independent of church configuration', async () => {
    await email.sendEmail('admin@example.org', 'Reset password', 'Reset link', '');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer organization-email-key' }),
      }),
    );
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported channel modes and reports every unconfigured channel as disabled', async () => {
    await expect(
      accounts.configure('church-a', 'email', { mode: 'invalid' } as never, 'admin'),
    ).rejects.toThrow('Invalid channel mode');
    expect(prisma.integrationChannel.upsert).not.toHaveBeenCalled();
    const settings = await accounts.list('church-a');
    expect(settings.channels).toHaveLength(5);
    expect(settings.channels.every((item) => item.mode === 'disabled')).toBe(true);
  });

  it('blocks new organization-funded church payments and rejects unbound payments', async () => {
    const platform = {
      isConfigured: jest.fn().mockReturnValue(true),
      initializeTransaction: jest.fn(),
    };
    const payments = new PaymentAccountsService(accounts, config);
    await expect(payments.current('church-a', 'paystack')).rejects.toThrow('disabled');
    expect(platform.initializeTransaction).not.toHaveBeenCalled();
    await expect(payments.historical('church-a', 'paystack', null)).rejects.toThrow(
      'account is required',
    );
  });

  it('rejects church checkout before creating a pending payment', async () => {
    const platform = {
      isConfigured: jest.fn().mockReturnValue(true),
      initializeTransaction: jest.fn(),
    };
    const payments = new PaymentAccountsService(accounts, config);
    const service = new GivingService(
      prisma as never,
      {} as never,
      new Map([['paystack', platform]]) as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      payments,
    );
    await expect(
      service.initializePayment(
        {
          categoryId: 'category-a',
          gateway: 'paystack',
          amount: 1000,
          email: 'member@example.org',
        },
        'church-a',
        'admin',
      ),
    ).rejects.toThrow('disabled');
    expect(platform.initializeTransaction).not.toHaveBeenCalled();
  });

  it('rejects a disabled broadcast before creating records or adding queue jobs', async () => {
    prisma.template = {
      findFirst: jest.fn().mockResolvedValue({ channel: 'sms', status: 'published' }),
    };
    prisma.broadcast = { create: jest.fn() };
    const queue = { add: jest.fn() };
    const service = new BroadcastService(
      prisma as never,
      { branchWhere: () => ({}) } as never,
      {} as never,
      {} as never,
      queue as never,
      queue as never,
      queue as never,
      queue as never,
      accounts,
    );
    await expect(
      service.create(
        { name: 'Test', templateId: 'template-a', channel: 'sms' },
        'church-a',
        'admin',
      ),
    ).rejects.toThrow('disabled');
    expect(prisma.broadcast.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
