import { z } from 'zod';

/**
 * Zod schema for validating environment variables at application startup.
 *
 * This ensures all required environment variables are present and properly formatted
 * before the application starts. Fails fast with descriptive error messages.
 *
 * @see .env.example for the full list of environment variables
 */

const envSchema = z.object({
  // ─── Application ──────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_URL: z.url().default('http://localhost:3000'),

  // ─── Database (Prisma + PostgreSQL) ───────────────────────
  DATABASE_URL: z.string().startsWith('postgresql://', {
    message: 'DATABASE_URL must be a valid PostgreSQL connection string',
  }),

  // ─── Supabase (Auth + Storage only) ───────────────────────
  SUPABASE_URL: z.url({
    message: 'SUPABASE_URL must be a valid URL (e.g., https://your-project.supabase.co)',
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_JWT_SECRET: z.string().optional(),

  // ─── Redis (Cache + Queue) ────────────────────────────────
  REDIS_URL: z.string().refine((val) => val.startsWith('redis://') || val.startsWith('https://'), {
    message: 'REDIS_URL must start with redis:// (local) or https:// (Upstash)',
  }),
  UPSTASH_REDIS_TOKEN: z.string().optional(),

  // ─── Payments (Optional for MVP, required for production) ─
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),

  // ─── WhatsApp (360dialog) ─────────────────────────────────
  '360DIALOG_API_KEY': z.string().optional(),
  '360DIALOG_WEBHOOK_SECRET': z.string().optional(),

  // ─── Email (Resend) ───────────────────────────────────────
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default('noreply@churchos.app'),

  // ─── SMS (Termii) ─────────────────────────────────────────
  TERMII_API_KEY: z.string().optional(),
  TERMII_FROM: z.string().default('ChurchOS'),

  // ─── AI (Optional) ────────────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),

  // ─── Storage (Supabase Storage) ──────────────────────────
  SUPABASE_STORAGE_BUCKET: z.string().default('media'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(5),

  // ─── Monitoring (Optional) ────────────────────────────────
  SENTRY_DSN: z.string().optional(),
});

/**
 * Parsed and validated environment variables.
 * Use this instead of `process.env` for type-safe access.
 *
 * @example
 * ```typescript
 * import { env } from './config/env.validation';
 *
 * console.log(env.DATABASE_URL); // Type-safe, validated
 * ```
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env against the schema and returns typed env object.
 * Throws a descriptive error if validation fails.
 */
function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}

/**
 * Validated environment variables.
 * Accessed throughout the application for type-safe env access.
 */
export const env = validateEnv();
