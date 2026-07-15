/**
 * @file church.fixture.ts
 * @description Mock church and branch fixtures for tests.
 *
 * @module test/fixtures/church
 * @since 1.0.0
 */

export const mockChurchId = '00000000-0000-0000-0000-000000000001';
export const mockBranchId = '00000000-0000-0000-0000-000000000010';

export const mockChurch = {
  id: mockChurchId,
  name: 'Grace Community Church',
  denomination: 'Pentecostal',
  address: '12 Allen Avenue, Ikeja',
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
  phone: '+234 801 234 5678',
  email: 'info@gracecommunity.ng',
  website: 'https://gracecommunity.ng',
  logo_url: null,
  config: {},
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

export const mockBranch = {
  id: mockBranchId,
  church_id: mockChurchId,
  name: 'Headquarters',
  is_headquarters: true,
  address: '12 Allen Avenue, Ikeja',
  city: 'Lagos',
  state: 'Lagos',
  phone: '+234 801 234 5678',
  email: 'hq@gracecommunity.ng',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};
