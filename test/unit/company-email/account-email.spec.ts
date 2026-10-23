import { ConfigService } from '@nestjs/config';
import { AccountEmailService } from '../../../src/company-email/account-email.service';
import {
  passwordResetEmail,
  signInCodeEmail,
  signupConfirmationEmail,
} from '../../../src/company-email/company-email.templates';

const webUrl = 'https://church-os-web.vercel.app';

describe('Company account emails', () => {
  const generateLink = jest.fn();
  const sendEmail = jest.fn();
  const service = new AccountEmailService(
    { client: { auth: { admin: { generateLink } } } } as never,
    new ConfigService({ WEB_URL: webUrl }),
    { sendEmail } as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'one-time-hash' } },
      error: null,
    });
    sendEmail.mockResolvedValue('provider-id');
  });
  it('sends branded recovery with the configured host and usable reset route', async () => {
    await service.sendPasswordReset('person@example.org');
    expect(generateLink).toHaveBeenCalledWith({ type: 'recovery', email: 'person@example.org' });
    const [to, subject, html, churchId, , options] = sendEmail.mock.calls[0];
    expect(to).toBe('person@example.org');
    expect(subject).toBe('Reset your ChurchOS password');
    expect(churchId).toBe('');
    expect(html).toContain(`${webUrl}/reset-password?token_hash=one-time-hash`);
    expect(html).toContain('bgcolor="#ffffff"');
    expect(html).not.toContain('localhost');
    expect(options.text).toContain('one-time-hash');
  });
  it.each([
    { data: null, error: { message: 'unknown user' } },
    { data: { properties: {} }, error: null },
  ])('does not send incomplete recovery links', async (result) => {
    generateLink.mockResolvedValue(result);
    await expect(service.sendPasswordReset('person@example.org')).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('reports provider failure to administrator callers', async () => {
    sendEmail.mockRejectedValue(new Error('mail unavailable'));
    await expect(service.sendPasswordReset('person@example.org')).rejects.toThrow(
      'mail unavailable',
    );
  });
  it('escapes church names and presents the code in HTML and plain text', () => {
    const content = signInCodeEmail(
      { churchName: '<script>bad()</script>', code: '012345', expiresInMinutes: 10 },
      webUrl,
    );
    expect(content.html).not.toContain('<script>');
    expect(content.html).toContain('&lt;script&gt;');
    expect(content.text).toContain('Sign-in code: 012345');
    expect(content.html).toContain('ACCOUNT SECURITY');
  });
  it('preserves the Supabase confirmation variable inside the shared design', () => {
    const content = signupConfirmationEmail(webUrl);
    expect(content.html).toContain('href="{{ .ConfirmationURL }}"');
    expect(content.html).toContain('bgcolor="#ffffff"');
  });
  it.each([
    'https://other.example/reset-password?token_hash=x',
    `${webUrl}/auth/reset-password?token_hash=x`,
    `${webUrl}/reset-password`,
    'javascript:alert(1)',
  ])('rejects invalid recovery destinations %s', (link) => {
    expect(() => passwordResetEmail(link, webUrl)).toThrow();
  });
});
