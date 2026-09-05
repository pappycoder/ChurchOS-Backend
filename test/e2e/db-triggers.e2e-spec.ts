/**
 * @file db-triggers.e2e-spec.ts
 * @description End-to-end tests for the sync_outbox DB trigger migration,
 * validating entity/action mapping and GUC suppression against a real database.
 */

import { Pool, PoolClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run e2e tests');
}

describe('sync_outbox DB triggers (e2e)', () => {
  let pool: Pool;
  const suffix = Date.now();

  beforeAll(() => {
    pool = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function withTx(fn: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await fn(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  async function seedChurch(client: PoolClient): Promise<string> {
    const { rows } = await client.query(
      `INSERT INTO churches (id, name, updated_at)
       VALUES (gen_random_uuid()::text, $1, NOW())
       RETURNING id`,
      [`e2e-triggers-${suffix}`],
    );
    return rows[0].id;
  }

  async function queueRows(client: PoolClient, churchId: string) {
    const { rows } = await client.query(
      `SELECT entity, entity_id, action, data
       FROM sync_queue
       WHERE church_id = $1
       ORDER BY created_at`,
      [churchId],
    );
    return rows;
  }

  async function insertMember(client: PoolClient, churchId: string, firstName = 'John') {
    const { rows } = await client.query(
      `INSERT INTO members (id, church_id, first_name, last_name, status, member_since, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, 'Doe', 'active', NOW(), NOW(), NOW())
       RETURNING id`,
      [churchId, firstName],
    );
    return rows[0].id;
  }

  it('queues a create event with the correct entity mapping', async () => {
    await withTx(async (client) => {
      const churchId = await seedChurch(client);
      await insertMember(client, churchId);

      const rows = await queueRows(client, churchId);
      expect(rows).toHaveLength(1);
      expect(rows[0].entity).toBe('member');
      expect(rows[0].action).toBe('create');
      expect(rows[0].data.first_name).toBe('John');
    });
  });

  it('queues update and delete events in order', async () => {
    await withTx(async (client) => {
      const churchId = await seedChurch(client);
      const memberId = await insertMember(client, churchId);

      await client.query(
        `UPDATE members SET status = 'inactive', updated_at = NOW() WHERE id = $1`,
        [memberId],
      );
      await client.query(`DELETE FROM members WHERE id = $1`, [memberId]);

      const rows = await queueRows(client, churchId);
      expect(rows.map((r) => `${r.entity}:${r.action}`)).toEqual([
        'member:create',
        'member:update',
        'member:delete',
      ]);
      expect(rows[2].data.status).toBe('inactive');
    });
  });

  it('maps other tables to their sync entity names', async () => {
    await withTx(async (client) => {
      const churchId = await seedChurch(client);
      await client.query(
        `INSERT INTO giving_categories (id, church_id, name, updated_at)
         VALUES (gen_random_uuid()::text, $1, 'Tithe', NOW())`,
        [churchId],
      );

      const rows = await queueRows(client, churchId);
      expect(rows).toHaveLength(1);
      expect(rows[0].entity).toBe('givingCategory');
      expect(rows[0].data.name).toBe('Tithe');
    });
  });

  it('honors the outbox-skip session variable', async () => {
    await withTx(async (client) => {
      const churchId = await seedChurch(client);

      await client.query(`SELECT set_config('app.sync_outbox.skip', 'true', true)`);
      await insertMember(client, churchId);
      await client.query(`SELECT set_config('app.sync_outbox.skip', 'false', true)`);

      const rows = await queueRows(client, churchId);
      expect(rows).toHaveLength(0);
    });
  });
});
