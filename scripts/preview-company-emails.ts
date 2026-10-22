import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { companyEmail, CompanyEmailKind } from '../src/company-email/company-email.templates';
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
console.log(`Email previews written to ${directory}`);
