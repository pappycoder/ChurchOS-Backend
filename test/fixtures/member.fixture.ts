/**
 * @file member.fixture.ts
 * @description Mock member fixtures for tests.
 *
 * @module test/fixtures/member
 * @since 1.0.0
 */

import { mockChurchId, mockBranchId } from './church.fixture';
import { MemberStatus } from '@prisma/client';

export const mockMemberId = '44444444-4444-4444-4444-444444444444';

export const mockMember = {
  id: mockMemberId,
  church_id: mockChurchId,
  branch_id: mockBranchId,
  first_name: 'Adebayo',
  last_name: 'Ogundimu',
  email: 'adebayo.ogundimu@gmail.com',
  phone: '+234 803 456 7890',
  whatsapp_number: '+234 803 456 7890',
  date_of_birth: new Date('1985-03-15'),
  gender: 'male',
  address: '12 Allen Avenue, Ikeja',
  city: 'Lagos',
  state: 'Lagos',
  status: MemberStatus.active,
  member_since: new Date('2024-01-01'),
  photo_url: null,
  custom_fields: {},
  notes: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

export const mockMembers = [
  mockMember,
  {
    ...mockMember,
    id: '77777777-7777-7777-7777-777777777777',
    first_name: 'Chioma',
    last_name: 'Nwosu',
    email: 'chioma.nwosu@gmail.com',
    phone: '+234 805 678 9012',
    whatsapp_number: '+234 805 678 9012',
    gender: 'female',
    date_of_birth: new Date('1990-07-22'),
  },
  {
    ...mockMember,
    id: '88888888-8888-8888-8888-888888888888',
    first_name: 'Emeka',
    last_name: 'Okonkwo',
    email: 'emeka.okonkwo@outlook.com',
    phone: '+234 807 890 1234',
    whatsapp_number: '+234 807 890 1234',
    gender: 'male',
    date_of_birth: new Date('1988-11-08'),
  },
];
