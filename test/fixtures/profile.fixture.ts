/**
 * @file profile.fixture.ts
 * @description Mock profile fixtures for tests.
 *
 * @module test/fixtures/profile
 * @since 1.0.0
 */

import { mockChurchId, mockBranchId } from './church.fixture';
import { mockSupabaseUserId } from './user.fixture';

export const mockAdminProfileId = '22222222-2222-2222-2222-222222222222';
export const mockMemberProfileId = '33333333-3333-3333-3333-333333333333';

export const mockAdminProfile = {
  id: mockAdminProfileId,
  user_id: mockSupabaseUserId,
  church_id: mockChurchId,
  branch_id: mockBranchId,
  member_id: '44444444-4444-4444-4444-444444444444',
  role: 'church_admin',
  first_name: 'Adebayo',
  last_name: 'Ogundimu',
  phone: '+234 803 456 7890',
  mfa_enabled: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

export const mockMemberProfile = {
  id: mockMemberProfileId,
  user_id: '55555555-5555-5555-5555-555555555555',
  church_id: mockChurchId,
  branch_id: mockBranchId,
  member_id: '66666666-6666-6666-6666-666666666666',
  role: 'member',
  first_name: 'Chioma',
  last_name: 'Nwosu',
  phone: '+234 805 678 9012',
  mfa_enabled: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};
