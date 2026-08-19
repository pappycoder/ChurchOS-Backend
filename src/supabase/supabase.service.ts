/**
 * @file supabase.service.ts
 * @description Wraps the Supabase client for server-side usage.
 *
 * Provides typed access to Supabase Auth (JWT validation, user lookup)
 * and Supabase Storage (file uploads). The client is initialized once
 * and shared across the application via NestJS DI.
 *
 * @module supabase/supabase.service
 * @since 1.0.0
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service wrapping the Supabase JavaScript client.
 *
 * @example
 * ```typescript
 * const { data, error } = await this.supabase.client.auth.getUser(token);
 * ```
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private _client!: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !serviceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }

    this._client = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log('Supabase client initialized');
  }

  /**
   * The raw Supabase client instance.
   */
  get client(): SupabaseClient {
    return this._client;
  }
}
