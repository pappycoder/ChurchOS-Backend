import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationAccountsService } from '../integrations/integration-accounts.service';
interface MessagingSendResult {
  requestId: string;
  provider: string;
  accountId: string;
}
/** Channel router: provider credentials and HTTP transport belong to integrations. */
@Injectable()
export class MessagingDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: IntegrationAccountsService,
  ) {}
  async sendSms(
    to: string,
    text: string,
    churchId: string,
    parentMessageId?: string,
  ): Promise<string> {
    const integration = await this.accounts.resolve(churchId, 'sms');
    if (!integration) throw new ServiceUnavailableException('Configure a church SMS account first');
    const id = await this.accounts.deliver(integration, 'sms', {
      ...integration.settings,
      from: integration.settings.from,
      to,
      text,
    });
    const row = await this.prisma.message.create({
      data: {
        church_id: churchId,
        phone: to,
        direction: 'outbound',
        channel: 'sms',
        content: text,
        status: 'sent',
        parent_message_id: parentMessageId ?? null,
        metadata: {
          provider: integration.provider,
          provider_id: id,
          integration_account_id: integration.accountId,
        },
      },
    });
    return row.id;
  }
  async sendWhatsAppMessage(
    to: string,
    text: string,
    churchId: string,
  ): Promise<MessagingSendResult> {
    const integration = await this.accounts.resolve(churchId, 'whatsapp');
    if (!integration)
      throw new ServiceUnavailableException('Configure a church WhatsApp account first');
    const id = await this.accounts.deliver(integration, 'whatsapp', {
      ...integration.settings,
      from: integration.settings.from ?? '',
      to,
      text,
    });
    return { requestId: id, provider: integration.provider, accountId: integration.accountId };
  }
  async sendWhatsAppTemplate(
    to: string,
    templateId: string,
    variables: Record<string, string> | undefined,
    churchId: string,
  ): Promise<MessagingSendResult> {
    const integration = await this.accounts.resolve(churchId, 'whatsapp');
    if (!integration)
      throw new ServiceUnavailableException('Configure a church WhatsApp account first');
    const id = await this.accounts.deliver(integration, 'whatsapp', {
      ...integration.settings,
      from: integration.settings.from ?? '',
      to,
      text: '',
      templateId,
      variables,
    });
    return { requestId: id, provider: integration.provider, accountId: integration.accountId };
  }
}
