// Reuse the E2E guard before opening any database connection.
import './e2e-env';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    // Supabase supplies these roles in deployed databases. Vanilla CI Postgres
    // needs unprivileged stand-ins so denial tests exercise real role ACLs.
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END $$;`);
    console.log('Disposable E2E browser roles are ready; no privileges were granted.');
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    'E2E database preparation failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
});
