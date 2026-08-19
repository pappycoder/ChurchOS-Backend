/**
 * @file supabase.module.ts
 * @description Global module providing the Supabase client.
 *
 * The Supabase client is created once via SupabaseService and available
 * in any module that needs Supabase Auth or Storage access.
 *
 * @module supabase/supabase.module
 * @since 1.0.0
 */

import { Module, Global } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
