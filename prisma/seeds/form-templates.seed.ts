/**
 * @file form-templates.seed.ts
 * @description Default form templates seed data.
 *
 * Seeds reusable form templates for a church:
 * - Membership Application
 * - Baptism Registration
 * - Wedding Application
 * - Event Request
 * - Expense Reimbursement
 *
 * Usage:
 *   Import `seedFormTemplates` into `prisma/seed.ts` and call it after the
 *   church record has been created.
 *
 * @module seeds/form-templates
 * @since 1.0.0
 */

import { PrismaClient, Prisma } from '@prisma/client';

interface FormFieldSeed {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

interface FormTemplateSeed {
  title: string;
  description?: string;
  fields: FormFieldSeed[];
  is_public: boolean;
}

const templates: FormTemplateSeed[] = [
  {
    title: 'Membership Application',
    description: 'Application form for new members joining the church.',
    is_public: true,
    fields: [
      { key: 'full_name', label: 'Full Name', type: 'text', required: true },
      { key: 'email', label: 'Email Address', type: 'email', required: true },
      { key: 'phone', label: 'Phone Number', type: 'phone', required: true },
      { key: 'gender', label: 'Gender', type: 'dropdown', required: true, options: ['Male', 'Female'] },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: false },
      { key: 'address', label: 'Home Address', type: 'textarea', required: true },
      {
        key: 'marital_status',
        label: 'Marital Status',
        type: 'dropdown',
        required: true,
        options: ['Single', 'Married', 'Divorced', 'Widowed'],
      },
      {
        key: 'interests',
        label: 'Areas of Interest',
        type: 'checkbox',
        required: false,
        options: ['Ushering', 'Choir', 'Media', 'Children', 'Evangelism', 'Welfare'],
      },
    ],
  },
  {
    title: 'Baptism Registration',
    description: 'Register for water baptism.',
    is_public: true,
    fields: [
      { key: 'full_name', label: 'Full Name', type: 'text', required: true },
      { key: 'email', label: 'Email Address', type: 'email', required: true },
      { key: 'phone', label: 'Phone Number', type: 'phone', required: true },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
      {
        key: 'gender',
        label: 'Gender',
        type: 'dropdown',
        required: true,
        options: ['Male', 'Female'],
      },
      {
        key: 'preferred_date',
        label: 'Preferred Baptism Date',
        type: 'date',
        required: true,
      },
      { key: 'testimony', label: 'Brief Testimony', type: 'textarea', required: false },
    ],
  },
  {
    title: 'Wedding Application',
    description: 'Application for church wedding solemnization.',
    is_public: false,
    fields: [
      { key: 'bride_name', label: "Bride's Full Name", type: 'text', required: true },
      { key: 'groom_name', label: "Groom's Full Name", type: 'text', required: true },
      { key: 'bride_email', label: "Bride's Email", type: 'email', required: true },
      { key: 'groom_email', label: "Groom's Email", type: 'email', required: true },
      { key: 'proposed_date', label: 'Proposed Wedding Date', type: 'date', required: true },
      { key: 'guest_count', label: 'Expected Guest Count', type: 'number', required: true },
      { key: 'counselling_completed', label: 'Pre-marital Counselling Completed', type: 'dropdown', required: true, options: ['Yes', 'No'] },
      { key: 'additional_notes', label: 'Additional Notes', type: 'textarea', required: false },
    ],
  },
  {
    title: 'Event Request',
    description: 'Request approval for a church event or activity.',
    is_public: false,
    fields: [
      { key: 'event_name', label: 'Event Name', type: 'text', required: true },
      { key: 'requester_name', label: 'Requester Name', type: 'text', required: true },
      { key: 'requester_email', label: 'Requester Email', type: 'email', required: true },
      { key: 'event_date', label: 'Event Date', type: 'date', required: true },
      { key: 'expected_attendance', label: 'Expected Attendance', type: 'number', required: true },
      { key: 'venue', label: 'Proposed Venue', type: 'text', required: true },
      { key: 'event_description', label: 'Event Description', type: 'textarea', required: true },
    ],
  },
  {
    title: 'Expense Reimbursement',
    description: 'Request reimbursement for an approved church expense.',
    is_public: false,
    fields: [
      { key: 'requester_name', label: 'Requester Name', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text', required: true },
      { key: 'expense_date', label: 'Expense Date', type: 'date', required: true },
      { key: 'amount', label: 'Amount (NGN)', type: 'number', required: true },
      { key: 'description', label: 'Expense Description', type: 'textarea', required: true },
      { key: 'receipt_url', label: 'Receipt URL', type: 'text', required: false },
    ],
  },
];

/**
 * Seeds default form templates for a church.
 *
 * @param prisma - PrismaClient instance
 * @param churchId - Church ID to associate templates with
 */
export async function seedFormTemplates(prisma: PrismaClient, churchId: string): Promise<void> {
  console.log('📦 Creating default form templates...');

  for (const template of templates) {
    const existing = await prisma.form.findFirst({
      where: { church_id: churchId, title: template.title },
    });

    if (existing) {
      await prisma.form.update({
        where: { id: existing.id },
        data: {
          description: template.description,
          fields: template.fields as unknown as Prisma.InputJsonValue,
          is_public: template.is_public,
        },
      });
    } else {
      await prisma.form.create({
        data: {
          church_id: churchId,
          title: template.title,
          description: template.description,
          fields: template.fields as unknown as Prisma.InputJsonValue,
          status: 'published',
          is_template: true,
          is_public: template.is_public,
          public_token: template.is_public ? crypto.randomUUID() : null,
        },
      });
    }

    console.log(`  ✅ Form Template: ${template.title}`);
  }
}
