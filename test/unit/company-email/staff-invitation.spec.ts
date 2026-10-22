import { ConfigService } from '@nestjs/config';
import { CompanyEmailService } from '../../../src/company-email/company-email.service';
import { invitationEmail } from '../../../src/company-email/company-email.templates';
import { StaffInvitationService } from '../../../src/company-email/staff-invitation.service';
import { publicWebUrl } from '../../../src/company-email/public-web-url';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SupabaseService } from '../../../src/supabase/supabase.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

const origin = 'https://church-os-web.vercel.app';
const input = {
  churchId: 'church',
  email: 'staff@example.com',
  firstName: 'Ada',
  lastName: 'Ola',
  role: 'church_admin',
  inviterUserId: 'admin',
};
const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as ConfigService;

describe('single website URL', () => {
  it('uses WEB_URL with or without a trailing slash', () => {
    expect(publicWebUrl(config({ WEB_URL: `${origin}/` }))).toBe(origin);
  });
  it.each([
    'http://localhost:3000',
    'https://localhost',
    'http://church.example',
    'https://user:pass@church.example',
    `${origin}/wrong`,
    `${origin}?wrong=1`,
  ])('rejects unsafe production configuration %s', (url) => {
    expect(() => publicWebUrl(config({ WEB_URL: url, NODE_ENV: 'production' }))).toThrow();
  });
  it('requires WEB_URL', () => expect(() => publicWebUrl(config({}))).toThrow('WEB_URL'));
});

describe('branded staff invitations', () => {
  const acceptUrl = `${origin}/accept-invitation#token_hash=secret`;
  it('uses the company design, escapes names and explains password setup', () => {
    const mail = invitationEmail(
      {
        churchName: '<Church>',
        firstName: 'Ada',
        inviterName: 'Admin',
        roleLabel: 'Church Admin',
        acceptUrl,
      },
      origin,
    );
    expect(mail.html).toContain('#c8f169');
    expect(mail.html).toContain('#123c35');
    expect(mail.html).toContain('&lt;Church&gt;');
    expect(mail.html).toContain(acceptUrl);
    expect(mail.text).toContain('password');
    expect(mail.text).toContain('sign in using this email address');
    expect(mail.html).not.toContain('/subscription');
  });
  it('rejects invitation links on another website', () => {
    expect(() =>
      invitationEmail(
        {
          churchName: 'Church',
          firstName: 'Ada',
          inviterName: 'Admin',
          roleLabel: 'Admin',
          acceptUrl: 'https://wrong.example/accept-invitation#token_hash=x',
        },
        origin,
      ),
    ).toThrow();
  });

  let prisma: ReturnType<typeof createPrismaMock>;
  let service: StaffInvitationService;
  let generateLink: jest.Mock;
  let deleteUser: jest.Mock;
  let emails: {
    assertInvitationDeliveryConfigured: jest.Mock;
    enqueueInvitation: jest.Mock;
    dispatch: jest.Mock;
  };
  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace Church' });
    prisma.role.findFirst.mockResolvedValue({ name: 'church_admin', label: 'Church Admin' });
    prisma.profile.findFirst.mockResolvedValue({ first_name: 'John', last_name: 'Admin' });
    prisma.profile.findUnique.mockResolvedValue(null);
    prisma.profile.create.mockResolvedValue({ id: 'profile', user_id: 'new-user' });
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (fn: (tx: unknown) => unknown) => fn(prisma),
    );
    generateLink = jest.fn().mockResolvedValue({
      data: {
        user: { id: 'new-user' },
        properties: { hashed_token: 'secret', action_link: 'http://localhost:3000/wrong' },
      },
      error: null,
    });
    deleteUser = jest.fn().mockResolvedValue({ error: null });
    emails = {
      assertInvitationDeliveryConfigured: jest.fn(),
      enqueueInvitation: jest.fn().mockResolvedValue('invitation/new-user'),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    service = new StaffInvitationService(
      prisma as unknown as PrismaService,
      { client: { auth: { admin: { generateLink, deleteUser } } } } as unknown as SupabaseService,
      emails as unknown as CompanyEmailService,
      config({ WEB_URL: origin, NODE_ENV: 'production' }),
    );
  });
  it('queues our email atomically with the profile and ignores the provider action URL', async () => {
    await service.create(input);
    expect(generateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: input.email,
      options: { redirectTo: `${origin}/accept-invitation` },
    });
    expect(emails.enqueueInvitation.mock.calls[0][0]).toBe(prisma);
    expect(emails.enqueueInvitation.mock.calls[0][1]).toMatchObject({
      acceptUrl,
      churchName: 'Grace Church',
      email: input.email,
    });
    expect(prisma.profile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: ['church_admin'], church_id: input.churchId }),
      }),
    );
    expect(emails.dispatch).toHaveBeenCalledWith('invitation/new-user');
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('checks mail configuration before creating an identity', async () => {
    emails.assertInvitationDeliveryConfigured.mockImplementation(() => {
      throw new Error('missing delivery');
    });
    await expect(service.create(input)).rejects.toThrow('missing delivery');
    expect(generateLink).not.toHaveBeenCalled();
  });
  it('does not delete an existing account', async () => {
    prisma.profile.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.create(input)).rejects.toThrow('already has');
    expect(deleteUser).not.toHaveBeenCalled();
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });
  it('cleans up the generated identity when the profile/outbox transaction fails', async () => {
    emails.enqueueInvitation.mockRejectedValue(new Error('outbox unavailable'));
    await expect(service.create(input)).rejects.toThrow('outbox unavailable');
    expect(deleteUser).toHaveBeenCalledWith('new-user');
    expect(emails.dispatch).not.toHaveBeenCalled();
  });
  it('preserves a committed invitation when immediate delivery fails', async () => {
    emails.dispatch.mockRejectedValue(new Error('delivery unavailable'));
    await expect(service.create(input)).resolves.toMatchObject({ id: 'profile' });
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('rejects provider failures before creating a profile', async () => {
    generateLink.mockResolvedValue({ data: {}, error: { message: 'provider failure' } });
    await expect(service.create(input)).rejects.toThrow('Unable to create invitation');
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });
});
