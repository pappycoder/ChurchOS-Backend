import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryService } from '../communication/email-delivery.service';
import { SupabaseService } from '../supabase/supabase.service';
import { passwordResetEmail } from './company-email.templates';

/** Shared delivery for public recovery and administrator-triggered password resets. */
@Injectable()
export class AccountEmailService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly email: EmailDeliveryService,
  ) {}

  async sendPasswordReset(recipient: string): Promise<void> {
    const webUrl = this.config.getOrThrow<string>('WEB_URL');
    const link = new URL('/reset-password', webUrl);
    const { data, error } = await this.supabase.client.auth.admin.generateLink({
      type: 'recovery',
      email: recipient,
    });
    if (error || !data?.properties?.hashed_token)
      throw new BadRequestException('Unable to create password reset link');
    link.searchParams.set('token_hash', data.properties.hashed_token);
    const content = passwordResetEmail(link.href, webUrl);
    await this.email.sendEmail(recipient, content.subject, content.html, '', undefined, {
      text: content.text,
    });
  }
}
