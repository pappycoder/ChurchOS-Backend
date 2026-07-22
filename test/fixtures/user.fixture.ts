/**
 * @file user.fixture.ts
 * @description Mock Supabase Auth user and JWT payload fixtures.
 *
 * @module test/fixtures/user
 * @since 1.0.0
 */

import type { SupabaseJwtPayload } from '../../src/auth/strategies/jwt.strategy';

export const mockSupabaseUserId = '11111111-1111-1111-1111-111111111111';

export const mockSupabaseUser = {
  id: mockSupabaseUserId,
  email: 'admin@gracecommunity.ng',
  phone: '+2348034567890',
  full_name: 'Adebayo Ogundimu',
  avatar_url: null,
};

export const mockSupabaseJwtPayload: SupabaseJwtPayload = {
  id: mockSupabaseUserId,
  sub: mockSupabaseUserId,
  email: 'admin@gracecommunity.ng',
  phone: '+2348034567890',
  app_metadata: {},
  user_metadata: {
    full_name: 'Adebayo Ogundimu',
  },
  role: 'authenticated',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};
