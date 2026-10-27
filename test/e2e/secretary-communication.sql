-- Run only in a disposable test database. Fixtures use temporary tables.
BEGIN;
CREATE TEMP TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, church_id TEXT);
CREATE TEMP TABLE permissions (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TEMP TABLE role_permissions (id TEXT PRIMARY KEY, role_id TEXT NOT NULL, permission_id TEXT NOT NULL, UNIQUE(role_id, permission_id));
INSERT INTO roles VALUES ('global-secretary', 'secretary', NULL), ('custom-secretary', 'secretary', 'church-a'), ('other-role', 'treasurer', NULL);
INSERT INTO permissions SELECT name, name FROM unnest(ARRAY['broadcasts:view','broadcasts:create','broadcasts:read','whatsapp:view','whatsapp:create','whatsapp:read','events:create','events:update','members:read']) AS name;
INSERT INTO role_permissions VALUES ('keep-secretary', 'global-secretary', 'members:read'), ('keep-other', 'other-role', 'broadcasts:read');
\ir ../../prisma/migrations/20261027100000_secretary_communications_and_events/migration.sql
\ir ../../prisma/migrations/20261027100000_secretary_communications_and_events/migration.sql
DO $$ BEGIN
 IF (SELECT count(*) FROM role_permissions WHERE role_id='global-secretary') <> 9 THEN RAISE EXCEPTION 'Missing Secretary grants or migration not idempotent'; END IF;
 IF (SELECT count(*) FROM role_permissions WHERE role_id='custom-secretary') <> 0 THEN RAISE EXCEPTION 'Changed church-owned role'; END IF;
 IF (SELECT count(*) FROM role_permissions WHERE role_id='other-role') <> 1 THEN RAISE EXCEPTION 'Changed another role'; END IF;
 IF (SELECT count(*) FROM role_permissions WHERE id IN ('keep-secretary','keep-other')) <> 2 THEN RAISE EXCEPTION 'Removed existing grants'; END IF;
END $$;
DELETE FROM role_permissions WHERE role_id='global-secretary';
DELETE FROM roles WHERE id='global-secretary';
\ir ../../prisma/migrations/20261027100000_secretary_communications_and_events/migration.sql
DO $$ BEGIN
 IF (SELECT count(*) FROM role_permissions) <> 1 THEN RAISE EXCEPTION 'Migration needs a seeded global Secretary template'; END IF;
END $$;
ROLLBACK;
