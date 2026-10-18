import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

it('preserves earlier service totals and links named details when upgrading to shared sessions', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const schema = `session_upgrade_${randomUUID().replace(/-/g, '')}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`
   CREATE TABLE churches (id text PRIMARY KEY);
   CREATE TABLE branches (id text PRIMARY KEY);
   CREATE TABLE services (id text PRIMARY KEY, branch_id text, category text DEFAULT 'adult');
   CREATE TABLE events (id text PRIMARY KEY);
   CREATE TABLE departments (id text PRIMARY KEY);
   CREATE TABLE cell_groups (id text PRIMARY KEY);
   CREATE TABLE members (id text PRIMARY KEY, church_id text, branch_id text);
   CREATE TABLE visitors (id text PRIMARY KEY, church_id text, branch_id text);
   CREATE TABLE attendance (id text PRIMARY KEY, church_id text, service_id text, member_id text, visitor_id text, checkin_at timestamp, category text DEFAULT 'adult');
   CREATE UNIQUE INDEX attendance_service_id_member_id_key ON attendance(service_id,member_id);
   CREATE TABLE department_attendance (id text PRIMARY KEY);
   CREATE TABLE cell_group_attendance (id text PRIMARY KEY);
  `);
    await client.query(
      await readFile(
        join(
          process.cwd(),
          'prisma/migrations/20261018120000_mixed_services_general_attendance/migration.sql',
        ),
        'utf8',
      ),
    );
    await client.query(
      `INSERT INTO churches VALUES ('church');INSERT INTO branches VALUES ('branch');INSERT INTO services (id,branch_id) VALUES ('service','branch');INSERT INTO members VALUES ('member','church','branch');INSERT INTO attendance (id,church_id,service_id,member_id,checkin_at) VALUES ('detail','church','service','member','2026-10-18 09:00:00');INSERT INTO general_attendance (id,church_id,branch_id,service_id,attendance_date,total,male_count,updated_at) VALUES ('total','church','branch','service','2026-10-18',25,0,now());`,
    );
    await client.query(
      await readFile(
        join(
          process.cwd(),
          'prisma/migrations/20261018160000_shared_attendance_sessions/migration.sql',
        ),
        'utf8',
      ),
    );
    const totals = await client.query(
      'SELECT id,total,adult_count,male_count,event_id,department_id,cell_group_id FROM attendance_sessions',
    );
    expect(totals.rows).toEqual([
      {
        id: 'total',
        total: 25,
        adult_count: null,
        male_count: 0,
        event_id: null,
        department_id: null,
        cell_group_id: null,
      },
    ]);
    expect(
      (await client.query('SELECT session_id FROM attendance WHERE id=$1', ['detail'])).rows[0]
        .session_id,
    ).toBe('total');
    const security = await client.query(
      'SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',
      [`${schema}.attendance_sessions`],
    );
    expect(security.rows[0].relrowsecurity).toBe(true);
    await client.query(
      await readFile(
        join(
          process.cwd(),
          'prisma/migrations/20261018170000_service_attendance_dates/migration.sql',
        ),
        'utf8',
      ),
    );
    expect(
      (
        await client.query('SELECT attendance_date::text AS day FROM attendance WHERE id=$1', [
          'detail',
        ])
      ).rows[0].day,
    ).toBe('2026-10-18');
    await client.query(
      "INSERT INTO attendance (id,church_id,service_id,member_id,checkin_at,attendance_date) VALUES ('next-week','church','service','member','2026-10-25 09:00:00','2026-10-25')",
    );
    expect(
      (await client.query('SELECT count(*)::int AS count FROM attendance')).rows[0].count,
    ).toBe(2);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
