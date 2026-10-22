import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  companyEmail,
  CompanyEmailKind,
  invitationEmail,
} from '../src/company-email/company-email.templates';
const directory = join(process.cwd(), 'docs', 'previews', 'company-emails');
mkdirSync(directory, { recursive: true });
for (const kind of ['welcome', 'activation', 'renewal', 'upgrade'] as CompanyEmailKind[]) {
  const content = companyEmail(
    {
      kind,
      churchName: 'Grace Community Church',
      firstName: 'Grace',
      plan: kind === 'upgrade' ? 'community' : 'essentials',
      cycle: 'monthly',
      amount: 10,
      currency: 'USD',
      reference: 'COSUB_' + 'a'.repeat(32),
      paidUntil: new Date('2026-11-22T12:00:00.000Z'),
      requiresEmailConfirmation: true,
    },
    'https://churchos.app',
  );
  writeFileSync(join(directory, kind + '.html'), content.html + '\n');
}
const invitation = invitationEmail(
  {
    churchName: 'Grace Community Church',
    firstName: 'Ada',
    inviterName: 'Grace Admin',
    roleLabel: 'Church Admin',
    acceptUrl: 'https://church-os-web.vercel.app/accept-invitation#token_hash=preview-only',
  },
  'https://church-os-web.vercel.app',
);
writeFileSync(join(directory, 'invitation.html'), invitation.html + '\n');
console.log(`Email previews written to ${directory}`);
