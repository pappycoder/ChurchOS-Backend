import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('Provider integration permission migration', () => {
  it('repairs a missing catalog idempotently and grants only global administrator templates', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const client = await pool.connect();
    const schema = `test_provider_permissions_${randomUUID().replace(/-/g, '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE permissions (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, resource TEXT NOT NULL, action TEXT NOT NULL);
        CREATE TABLE roles (id TEXT PRIMARY KEY, church_id TEXT, name TEXT NOT NULL);
        CREATE TABLE role_permissions (id TEXT PRIMARY KEY, role_id TEXT REFERENCES roles(id), permission_id TEXT REFERENCES permissions(id), UNIQUE(role_id, permission_id));
        INSERT INTO roles VALUES ('admin',NULL,'church_admin'), ('super',NULL,'super_admin'), ('pastor',NULL,'senior_pastor'), ('usher',NULL,'usher'), ('tenant-role','church-a','church_admin');
        INSERT INTO permissions VALUES ('existing','members:read','members','read');
        INSERT INTO role_permissions VALUES ('existing-grant','usher','existing');
      `);
      const migration = readFileSync(
        join(
          process.cwd(),
          'prisma/migrations/20261018220000_provider_integration_permissions/migration.sql',
        ),
        'utf8',
      );
      await client.query(migration);
      await client.query(migration);
      expect(
        (
          await client.query(
            "SELECT name FROM permissions WHERE resource = 'integrations' ORDER BY name",
          )
        ).rows.map((row: { name: string }) => row.name),
      ).toEqual([
        'integrations:create',
        'integrations:delete',
        'integrations:read',
        'integrations:update',
        'integrations:view',
      ]);
      const grants = (
        await client.query(
          "SELECT role_id, count(*)::int AS count FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE p.resource = 'integrations' GROUP BY role_id ORDER BY role_id",
        )
      ).rows;
      expect(grants).toEqual([
        { role_id: 'admin', count: 5 },
        { role_id: 'super', count: 5 },
      ]);
      expect(
        (await client.query("SELECT * FROM role_permissions WHERE id = 'existing-grant'")).rowCount,
      ).toBe(1);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
