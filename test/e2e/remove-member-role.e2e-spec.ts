import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('Retire member login role migration', () => {
  it('preserves staff and member data, disables member-only profiles and prevents reintroduction', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const client = await pool.connect();
    const schema = `test_retired_role_${randomUUID().replace(/-/g, '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE members (id TEXT PRIMARY KEY);
        CREATE TABLE profiles (id TEXT PRIMARY KEY, member_id TEXT REFERENCES members(id), role TEXT[] NOT NULL DEFAULT ARRAY['member'], status TEXT NOT NULL DEFAULT 'active', updated_at TIMESTAMP NOT NULL DEFAULT now());
        CREATE TABLE roles (id TEXT PRIMARY KEY, church_id TEXT, name TEXT NOT NULL);
        CREATE TABLE role_permissions (id TEXT PRIMARY KEY, role_id TEXT REFERENCES roles(id));
        CREATE TABLE church_role_permissions (id TEXT PRIMARY KEY, role_name TEXT NOT NULL);
        CREATE TABLE department_members (id TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'member');
        INSERT INTO members VALUES ('person');
        INSERT INTO profiles (id,member_id,role) VALUES ('only','person',ARRAY['member']), ('mixed',NULL,ARRAY['cell_leader','member']), ('staff',NULL,ARRAY['church_admin']);
        INSERT INTO profiles (id,role,status) VALUES ('disabled',ARRAY['member','secretary'],'inactive');
        INSERT INTO roles VALUES ('old',NULL,'member'), ('custom-old','c','member'), ('keep',NULL,'cell_leader');
        INSERT INTO role_permissions VALUES ('old-grant','old'), ('custom-old-grant','custom-old'), ('keep-grant','keep');
        INSERT INTO church_role_permissions VALUES ('old-override','member'), ('keep-override','cell_leader');
        INSERT INTO department_members (id) VALUES ('group-person');
      `);
      const migration = readFileSync(
        join(
          process.cwd(),
          'prisma/migrations/20261019120000_remove_member_login_role/migration.sql',
        ),
        'utf8',
      );
      await client.query(migration);
      await client.query(migration);
      expect(
        (await client.query('SELECT id, role, status FROM profiles ORDER BY id')).rows,
      ).toEqual([
        { id: 'disabled', role: ['secretary'], status: 'inactive' },
        { id: 'mixed', role: ['cell_leader'], status: 'active' },
        { id: 'only', role: [], status: 'inactive' },
        { id: 'staff', role: ['church_admin'], status: 'active' },
      ]);
      expect((await client.query('SELECT id FROM members')).rows).toEqual([{ id: 'person' }]);
      expect(
        (await client.query("SELECT member_id FROM profiles WHERE id='only'")).rows[0].member_id,
      ).toBe('person');
      expect((await client.query('SELECT * FROM role_permissions')).rows).toEqual([
        { id: 'keep-grant', role_id: 'keep' },
      ]);
      expect((await client.query('SELECT * FROM church_role_permissions')).rows).toEqual([
        { id: 'keep-override', role_name: 'cell_leader' },
      ]);
      expect((await client.query('SELECT role FROM department_members')).rows[0].role).toBe(
        'member',
      );
      await expect(
        client.query("UPDATE profiles SET role=ARRAY['member'] WHERE id='staff'"),
      ).rejects.toThrow();
      await expect(
        client.query("INSERT INTO roles VALUES ('recreated','c','member')"),
      ).rejects.toThrow();
      await expect(
        client.query("INSERT INTO church_role_permissions VALUES ('recreated','member')"),
      ).rejects.toThrow();
      await client.query("INSERT INTO profiles (id,status) VALUES ('no-default','inactive')");
      expect(
        (await client.query("SELECT role FROM profiles WHERE id='no-default'")).rows[0].role,
      ).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
