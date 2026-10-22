import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261022120000_church_wide_giving_categories/migration.sql',
  ),
  'utf8',
);

describe('Church-wide giving category migration', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  afterAll(() => pool.end());

  it('shares existing categories, preserves history, and enforces names across archives and branches', async () => {
    const client = await pool.connect();
    const schema = `test_giving_categories_${randomUUID().replace(/-/g, '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE giving_categories (
          id TEXT PRIMARY KEY, church_id TEXT NOT NULL, branch_id TEXT, name TEXT NOT NULL,
          archived_at TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE transactions (id TEXT PRIMARY KEY, category_id TEXT REFERENCES giving_categories(id), branch_id TEXT);
        INSERT INTO giving_categories (id, church_id, branch_id, name) VALUES
          ('tithe', 'church-a', 'branch-a', ' Tithe '),
          ('other-church', 'church-b', 'branch-b', 'Tithe');
        INSERT INTO transactions VALUES ('gift', 'tithe', 'branch-a');
      `);
      await client.query(migration);
      expect(
        (await client.query("SELECT name, branch_id FROM giving_categories WHERE id = 'tithe'"))
          .rows,
      ).toEqual([{ name: 'Tithe', branch_id: null }]);
      expect((await client.query('SELECT * FROM transactions')).rows).toEqual([
        { id: 'gift', category_id: 'tithe', branch_id: 'branch-a' },
      ]);
      for (const name of ['Tithe', 'tithe', ' TITHE ', '\tTithe\n']) {
        await expect(
          client.query('INSERT INTO giving_categories (id, church_id, name) VALUES ($1, $2, $3)', [
            randomUUID(),
            'church-a',
            name,
          ]),
        ).rejects.toMatchObject({ code: '23505' });
      }
      await client.query(
        "UPDATE giving_categories SET archived_at = CURRENT_TIMESTAMP WHERE id = 'tithe'",
      );
      await expect(
        client.query(
          "INSERT INTO giving_categories (id,church_id,name) VALUES ('dup','church-a','TITHE')",
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await client.query(
        "INSERT INTO giving_categories (id,church_id,name) VALUES ('offering','church-a','Offering')",
      );
      await expect(
        client.query("UPDATE giving_categories SET name=' tithe ' WHERE id='offering'"),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        client.query("UPDATE giving_categories SET branch_id='branch-b' WHERE id='offering'"),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        client.query(
          "INSERT INTO giving_categories (id,church_id,name) VALUES ('blank','church-a',E' \\t\\n')",
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await client.query("UPDATE giving_categories SET archived_at = NULL WHERE id = 'tithe'");
    } finally {
      await client.query('ROLLBACK');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
    }
  });

  it('stops atomically for existing duplicate names, including archived rows', async () => {
    const client = await pool.connect();
    const schema = `test_giving_categories_${randomUUID().replace(/-/g, '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE giving_categories (
          id TEXT PRIMARY KEY, church_id TEXT NOT NULL, branch_id TEXT, name TEXT NOT NULL,
          archived_at TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO giving_categories VALUES
          ('a','church-a','branch-a','Tithe',NULL,CURRENT_TIMESTAMP),
          ('b','church-a','branch-b',' tithe ',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
      `);
      await expect(client.query(migration)).rejects.toThrow('Duplicate giving category names');
      await client.query('ROLLBACK');
      expect(
        (await client.query('SELECT branch_id FROM giving_categories ORDER BY id')).rows,
      ).toEqual([{ branch_id: 'branch-a' }, { branch_id: 'branch-b' }]);
    } finally {
      await client.query('ROLLBACK');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
    }
  });
});
