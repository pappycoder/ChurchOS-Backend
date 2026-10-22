import { BillingCycle, SubscriptionPlan } from '@prisma/client';

export type CompanyEmailKind = 'welcome' | 'activation' | 'renewal' | 'upgrade';
export interface CompanyEmailInput {
  kind: CompanyEmailKind;
  churchName: string;
  firstName?: string;
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  amount?: number;
  currency?: string;
  reference?: string;
  paidUntil?: Date;
  requiresEmailConfirmation?: boolean;
}
export interface CompanyEmailContent {
  subject: string;
  html: string;
  text: string;
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const planNames: Record<SubscriptionPlan, string> = {
  essentials: 'Essentials',
  community: 'Community',
  network: 'Network',
  enterprise: 'Enterprise',
};

/** Table-based, inline-styled HTML remains readable when email clients block images/CSS. */
export function companyEmail(input: CompanyEmailInput, webUrl: string): CompanyEmailContent {
  const origin = new URL(webUrl);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password)
    throw new Error('Invalid ChurchOS website URL');
  const actionUrl = new URL(
    input.kind === 'welcome' ? '/subscription' : '/dashboard',
    origin.origin,
  ).href;
  const billingUrl = new URL('/subscription', origin.origin).href;
  const helpUrl = new URL('/help', origin.origin).href;
  const logoUrl = new URL('/brand/churchos-emblem.png', origin.origin).href;
  const welcome = input.kind === 'welcome';
  const titles = {
    welcome: 'Welcome to ChurchOS.',
    activation: 'Your church is ready to grow.',
    renewal: 'Here’s to another chapter.',
    upgrade: 'More room for your ministry.',
  };
  const subjects = {
    welcome: 'Welcome to ChurchOS — your next chapter starts here',
    activation: 'Your ChurchOS subscription is active',
    renewal: 'Your ChurchOS renewal is confirmed',
    upgrade: 'Your ChurchOS plan upgrade is confirmed',
  };
  const title = titles[input.kind];
  const subject = subjects[input.kind];
  const greeting = input.firstName ? `Hello ${input.firstName},` : 'Hello,';
  const lead = welcome
    ? `Thank you for choosing ChurchOS for ${input.churchName}. Your account and church workspace have been created. We’re glad you’re here.`
    : input.kind === 'renewal'
      ? `Thank you for renewing ChurchOS for ${input.churchName}. Your payment has been confirmed and your new subscription period is in place.`
      : input.kind === 'upgrade'
        ? `Your payment has been confirmed and ${input.churchName} has moved to the ${planNames[input.plan]} plan. Your team can now use the features included in your new plan.`
        : `Your payment has been confirmed and the ${planNames[input.plan]} plan is now active for ${input.churchName}. Your team can start using your church workspace.`;
  const rows: [string, string][] = [
    ['Church', input.churchName],
    [welcome ? 'Selected plan' : 'Plan', planNames[input.plan]],
    ['Billing cycle', input.cycle === 'annual' ? 'Yearly' : 'Monthly'],
  ];
  if (!welcome) {
    if (
      input.amount === undefined ||
      !input.currency ||
      !input.reference ||
      !input.paidUntil ||
      !Number.isFinite(input.paidUntil.getTime())
    )
      throw new Error('Confirmed billing details are required');
    rows.push([
      'Amount paid',
      new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: input.currency,
        currencyDisplay: 'code',
      }).format(input.amount),
    ]);
    rows.push(['Payment reference', input.reference]);
    rows.push([
      'Access through',
      new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Lagos',
      }).format(input.paidUntil),
    ]);
  }
  const next = welcome
    ? `${input.requiresEmailConfirmation ? 'Complete the email verification requested at registration, then sign in. ' : ''}Choose or review your plan and complete payment to activate your workspace. You can then add your people, record attendance and giving, and invite your team.`
    : input.kind === 'upgrade'
      ? 'Your current billing cycle and renewal date stay the same. Review your updated plan and access period in Plan & Billing.'
      : 'Your renewal is manual. When your next renewal is due, open Plan & Billing to review your plan and complete payment.';
  const cta = welcome ? 'Review your plan' : 'Open your workspace';
  const preheader = welcome
    ? 'A stronger foundation for the people behind your ministry.'
    : `${planNames[input.plan]} · ${input.kind === 'renewal' ? 'Renewal confirmed' : 'Payment confirmed'} · ${input.churchName}`;
  const details = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:12px 16px;border-bottom:1px solid #dfe8e5;color:#55716b;font-size:13px;vertical-align:top;width:38%">${escape(label)}</td><td style="padding:12px 16px;border-bottom:1px solid #dfe8e5;color:#123c35;font-size:14px;font-weight:600;overflow-wrap:anywhere">${escape(value)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title></head><body style="margin:0;padding:0;background:#eef4f1;color:#123c35;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f1"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe8e5;border-radius:20px;overflow:hidden"><tr><td style="height:6px;background:#c8f169"></td></tr><tr><td style="padding:28px 32px;background:#123c35"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px"><img src="${escape(logoUrl)}" width="38" height="38" alt="" style="display:block;border:0;background:#ffffff;border-radius:9px"></td><td style="font-size:25px;font-weight:700;letter-spacing:-1px;color:#ffffff">ChurchOS<span style="color:#c8f169">.</span></td></tr></table><p style="margin:17px 0 0;font-size:11px;letter-spacing:2px;font-weight:700;color:#c8f169">${welcome ? 'WELCOME TO YOUR NEXT CHAPTER' : 'PAYMENT CONFIRMED'}</p></td></tr><tr><td style="padding:32px"><h1 style="margin:0 0 24px;font-size:30px;line-height:1.2;letter-spacing:-1px;color:#123c35">${escape(title)}</h1><p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#244d45">${escape(greeting)}</p><p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#42645c">${escape(lead)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dfe8e5;border-radius:12px;background:#f7faf8">${details}</table><h2 style="margin:28px 0 10px;font-size:17px;color:#123c35">${welcome ? 'A simple next step' : 'What happens next'}</h2><p style="margin:0 0 26px;font-size:14px;line-height:1.8;color:#55716b">${escape(next)}</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#c8f169;border-radius:9px"><a href="${escape(actionUrl)}" style="display:inline-block;padding:15px 23px;color:#123c35;font-size:14px;font-weight:700;text-decoration:none">${escape(cta)} &rarr;</a></td></tr></table>${welcome ? '' : `<p style="margin:20px 0 0;font-size:13px;color:#55716b"><a href="${escape(billingUrl)}" style="color:#12665a">View Plan &amp; Billing</a> for your payment history and renewal details.</p>`}<p style="margin:28px 0 0;font-size:14px;line-height:1.7;color:#55716b">With you in the work,<br><strong style="color:#123c35">The ChurchOS team</strong></p></td></tr><tr><td style="padding:22px 32px;background:#f7faf8;border-top:1px solid #dfe8e5"><p style="margin:0 0 8px;color:#55716b;font-size:12px;line-height:1.7">Built for the people behind your ministry.</p><p style="margin:0;color:#6b817b;font-size:11px;line-height:1.8">This is an account notification from ChurchOS. <a href="${escape(helpUrl)}" style="color:#12665a">Visit the Help Centre</a> or use Contact support in your workspace.</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${subject}\n\n${greeting}\n\n${lead}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${next}\n\n${cta}: ${actionUrl}\nPlan & Billing: ${billingUrl}\nHelp Centre: ${helpUrl}\n\nThe ChurchOS team\nBuilt for the people behind your ministry.`;
  return { subject, html, text };
}
