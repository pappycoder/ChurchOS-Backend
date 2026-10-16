import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';

export const MESSAGING_PROVIDERS = ['resend', 'termii'] as const;
export type MessagingProvider = (typeof MESSAGING_PROVIDERS)[number];
export type MessagingMode = 'platform' | 'custom' | 'disabled';
export interface MessagingCredentials {
  apiKey: string;
  baseUrl?: string;
  from?: string;
  deviceId?: string;
  webhookSecret?: string;
  verifyToken?: string;
}

@Injectable()
export class MessagingCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditLoggingService,
  ) {}

  provider(value: string): MessagingProvider {
    if (!MESSAGING_PROVIDERS.includes(value as MessagingProvider))
      throw new BadRequestException('Unknown messaging provider');
    return value as MessagingProvider;
  }

  private key(): Buffer {
    const value = this.config.get<string>('MESSAGING_ENCRYPTION_KEY');
    if (!value || !/^[a-f\d]{64}$/i.test(value))
      throw new ServiceUnavailableException('Messaging encryption is not configured');
    return Buffer.from(value, 'hex');
  }

  // Authenticated context prevents moving ciphertext between churches/providers.
  encrypt(
    churchId: string,
    provider: MessagingProvider,
    credentials: MessagingCredentials,
  ): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(`${churchId}:${provider}:v1`));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      data.toString('base64'),
    ].join('.');
  }

  decrypt(churchId: string, provider: MessagingProvider, value: string): MessagingCredentials {
    try {
      const [version, iv, tag, data, extra] = value.split('.');
      if (version !== 'v1' || extra || !iv || !tag || !data) throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
      cipher.setAAD(Buffer.from(`${churchId}:${provider}:v1`));
      cipher.setAuthTag(Buffer.from(tag, 'base64'));
      return JSON.parse(
        Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString(
          'utf8',
        ),
      ) as MessagingCredentials;
    } catch {
      throw new ServiceUnavailableException('Messaging credentials cannot be decrypted');
    }
  }

  termiiBaseUrl(value?: string): string {
    const url = value || 'https://api.termii.com';
    if (!['https://api.termii.com', 'https://api.ng.termii.com'].includes(url))
      throw new BadRequestException('Choose a supported Termii API origin');
    return url;
  }

  private platform(provider: MessagingProvider): MessagingCredentials {
    return provider === 'resend'
      ? {
          apiKey: this.config.get<string>('RESEND_API_KEY', ''),
          from: this.config.get<string>('RESEND_FROM', 'noreply@churchos.app'),
        }
      : {
          apiKey: this.config.get<string>('TERMII_API_KEY', ''),
          baseUrl: this.termiiBaseUrl(this.config.get<string>('TERMII_BASE_URL')),
          from: this.config.get<string>('TERMII_FROM', 'ChurchOS'),
          deviceId: this.config.get<string>('TERMII_WHATSAPP_DEVICE_ID'),
          webhookSecret: this.config.get<string>('TERMII_WEBHOOK_SECRET'),
          verifyToken: this.config.get<string>('TERMII_WEBHOOK_VERIFY_TOKEN'),
        };
  }

  async resolve(churchId: string, provider: MessagingProvider): Promise<MessagingCredentials> {
    // Empty church ID is used exclusively by platform authentication emails.
    if (!churchId && provider === 'resend') return this.platform(provider);
    if (!churchId) throw new BadRequestException('A church is required for messaging');
    const row = await this.prisma.messagingIntegration.findUnique({
      where: { church_id_provider: { church_id: churchId, provider } },
    });
    if (!row || row.mode === 'platform') return this.platform(provider);
    if (row.mode === 'disabled')
      throw new ServiceUnavailableException('Messaging provider is disabled');
    if (row.mode !== 'custom' || !row.ciphertext)
      throw new ServiceUnavailableException('Messaging provider is not configured');
    return this.decrypt(churchId, provider, row.ciphertext);
  }

  async status(churchId: string) {
    const rows = await this.prisma.messagingIntegration.findMany({
      where: { church_id: churchId },
      select: { provider: true, mode: true, updated_at: true },
    });
    return MESSAGING_PROVIDERS.map((provider) => {
      const row = rows.find((item) => item.provider === provider);
      return {
        provider,
        mode: row?.mode ?? 'platform',
        configured:
          row?.mode === 'custom' ||
          ((!row || row.mode === 'platform') && !!this.platform(provider).apiKey),
        updatedAt: row?.updated_at ?? null,
      };
    });
  }

  async save(
    churchId: string,
    provider: MessagingProvider,
    mode: MessagingMode,
    input: Partial<MessagingCredentials>,
    userId: string,
  ) {
    this.provider(provider);
    if (!churchId || !['platform', 'custom', 'disabled'].includes(mode))
      throw new BadRequestException('Invalid messaging configuration');
    let ciphertext: string | null = null;
    if (mode === 'custom') {
      // Full replacement avoids stale sender/device details and makes rotation atomic.
      if (!input.apiKey || !/^[^\s\x00-\x1f\x7f]{8,512}$/.test(input.apiKey))
        throw new BadRequestException('A valid API key is required');
      if (
        provider === 'resend' &&
        (!input.from || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input.from))
      )
        throw new BadRequestException('A verified sender email is required');
      if (provider === 'termii') {
        this.termiiBaseUrl(input.baseUrl);
        if (!input.from || !/^[a-z\d +_-]{1,16}$/i.test(input.from))
          throw new BadRequestException('A valid SMS sender ID is required');
        if (input.deviceId && (!input.webhookSecret || input.webhookSecret.length < 32))
          throw new BadRequestException(
            'WhatsApp requires a webhook signing secret (32+ characters)',
          );
      }
      const credentials: MessagingCredentials =
        provider === 'resend'
          ? { apiKey: input.apiKey, from: input.from }
          : {
              apiKey: input.apiKey,
              baseUrl: this.termiiBaseUrl(input.baseUrl),
              from: input.from,
              deviceId: input.deviceId,
              webhookSecret: input.webhookSecret,
              verifyToken: input.verifyToken,
            };
      ciphertext = this.encrypt(churchId, provider, credentials);
    } else if (Object.values(input).some((value) => value !== undefined)) {
      throw new BadRequestException('Credentials are accepted only in custom mode');
    }
    await this.prisma.messagingIntegration.upsert({
      where: { church_id_provider: { church_id: churchId, provider } },
      create: { church_id: churchId, provider, mode, ciphertext },
      update: { mode, ciphertext },
    });
    await this.audit.log({
      churchId,
      userId,
      entity: 'messaging_integration',
      action: 'UPDATE',
      newValues: { provider, mode },
    });
    return this.status(churchId);
  }

  async platformWebhookChurch(): Promise<string> {
    const churchId = this.config.get<string>('TERMII_DEFAULT_CHURCH_ID');
    if (!churchId)
      throw new ServiceUnavailableException('Platform webhook church is not configured');
    const row = await this.prisma.messagingIntegration.findUnique({
      where: { church_id_provider: { church_id: churchId, provider: 'termii' } },
    });
    if (row && row.mode !== 'platform')
      throw new ServiceUnavailableException('Platform webhook is disabled for this church');
    return churchId;
  }

  async webhookCredentials(churchId: string): Promise<MessagingCredentials> {
    const row = await this.prisma.messagingIntegration.findUnique({
      where: { church_id_provider: { church_id: churchId, provider: 'termii' } },
    });
    if (row?.mode !== 'custom' || !row.ciphertext)
      throw new ServiceUnavailableException('Church webhook is not configured');
    return this.decrypt(churchId, 'termii', row.ciphertext);
  }
}
