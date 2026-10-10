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

import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
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

  createAuthClient(): SupabaseClient {
    return createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_ANON_KEY'),
      {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      },
    );
  }

  /** Stateless user-scoped Auth API calls; never mutate the shared admin session. */
  async authRequest<T>(token: string, path: string, body?: unknown, method = 'POST'): Promise<T> {
    const response = await fetch(
      `${this.config.getOrThrow<string>('SUPABASE_URL')}/auth/v1/${path}`,
      {
        method,
        headers: {
          apikey: this.config.getOrThrow<string>('SUPABASE_ANON_KEY'),
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new BadRequestException('Authenticator request failed. Check your code and try again.');
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  /**
   * The raw Supabase client instance.
   */
  get client(): SupabaseClient {
    return this._client;
  }
}
