import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TermiiService } from '../../../src/communication/termii.service';
import { ResendService } from '../../../src/communication/resend.service';
import { MessagingCredentialsService } from '../../../src/messaging-integrations/messaging-credentials.service';

describe('Messaging provider requests', () => {
  const resolve = jest.fn();
  const create = jest.fn();
  const notify = jest.fn();
  let termii: TermiiService;
  let resend: ResendService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    resolve.mockReset().mockImplementation((churchId: string) => ({
      apiKey: `${churchId}-key`,
      from: `${churchId}@example.org`,
      deviceId: `${churchId}-device`,
    }));
    create.mockReset().mockResolvedValue({ id: 'message-id' });
    const prisma = { message: { create } } as unknown as PrismaService;
    const moduleRef = { get: () => ({ notify }) } as unknown as ModuleRef;
    const credentials = {
      resolve,
      termiiBaseUrl: (value?: string) => value ?? 'https://api.termii.com',
    } as unknown as MessagingCredentialsService;
    termii = new TermiiService(prisma, moduleRef, credentials);
    resend = new ResendService(prisma, moduleRef, credentials);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-id', request_id: 'request-id' }),
    } as Response);
  });

  it('uses the selected church credentials for email, SMS, WhatsApp and approved templates', async () => {
    await resend.sendEmail('recipient@example.org', 'Subject', '<p>Message</p>', 'church-a');
    await termii.sendSms('+2348012345678', 'Hello', 'church-b');
    await termii.sendWhatsAppMessage('+2348012345678', 'Hello', 'church-c');
    await termii.sendWhatsAppTemplate(
      '+2348012345678',
      'approved-id',
      { name: 'Test' },
      'church-d',
    );
    const calls = fetchMock.mock.calls;
    expect(calls[0][1]?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer church-a-key' }),
    );
    expect(JSON.parse(calls[0][1]?.body as string).from).toBe('church-a@example.org');
    expect(JSON.parse(calls[1][1]?.body as string)).toEqual(
      expect.objectContaining({ api_key: 'church-b-key', channel: 'generic' }),
    );
    expect(JSON.parse(calls[2][1]?.body as string)).toEqual(
      expect.objectContaining({
        api_key: 'church-c-key',
        from: 'church-c-device',
        channel: 'whatsapp',
      }),
    );
    expect(JSON.parse(calls[3][1]?.body as string)).toEqual(
      expect.objectContaining({
        api_key: 'church-d-key',
        device_id: 'church-d-device',
        template_id: 'approved-id',
      }),
    );
    expect(calls.every((call) => call[1]?.signal instanceof AbortSignal)).toBe(true);
    expect(JSON.stringify(create.mock.calls)).not.toMatch(/church-[abcd]-key/);
  });

  it('does not falsely report acceptance for malformed provider success responses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'not accepted' }),
    } as Response);
    await expect(resend.sendEmail('test@example.org', 'Hi', 'Body', 'church-a')).rejects.toThrow(
      'did not confirm',
    );
    await expect(termii.sendSms('+2348012345678', 'Hi', 'church-a')).rejects.toThrow(
      'did not confirm',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts Termii message_id responses and platform auth emails without invalid tenant records', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message_id: 'termii-message-id' }),
    } as Response);
    expect(await termii.sendWhatsAppMessage('+2348012345678', 'Hi', 'church-a')).toEqual({
      requestId: 'termii-message-id',
    });
    expect(await resend.sendEmail('test@example.org', 'Sign-in', 'Code', '')).toBe('email-id');
    expect(create).not.toHaveBeenCalled();
  });

  it('does not send or fall back when tenant credential resolution fails', async () => {
    resolve.mockRejectedValue(new Error('Disabled or corrupt'));
    await expect(termii.sendSms('+2348012345678', 'Hello', 'church-a')).rejects.toThrow();
    await expect(resend.sendEmail('test@example.org', 'Hi', 'Body', 'church-a')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose provider error bodies or request errors containing secrets', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'secret-provider-reflection';
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => secret,
    } as Response);
    await expect(termii.sendSms('+2348012345678', 'Hi', 'church-a')).rejects.toThrow(
      'Failed to send SMS',
    );
    fetchMock.mockRejectedValueOnce(new Error(secret));
    await expect(resend.sendEmail('test@example.org', 'Hi', 'Body', 'church-a')).rejects.toThrow(
      'Failed to send email',
    );
    expect(JSON.stringify([error.mock.calls, notify.mock.calls])).not.toContain(secret);
  });
});
