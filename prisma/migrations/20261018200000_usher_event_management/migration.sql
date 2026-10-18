-- Add event-management grants to existing global ushers, preserving custom roles and overrides.
BEGIN;
INSERT INTO "permissions" ("id", "name", "resource", "action")
SELECT gen_random_uuid()::text, grants.name, grants.resource, grants.action
FROM (VALUES
  ('events:calendar:read', 'events:calendar', 'read'),
  ('events:list:read', 'events:list', 'read'),
  ('events:tickets:read', 'events:tickets', 'read'),
  ('events:create', 'events', 'create'),
  ('events:read', 'events', 'read'),
  ('events:update', 'events', 'update'),
  ('events:delete', 'events', 'delete'),
  ('events:ticket-records:read', 'events:ticket-records', 'read'),
  ('events:all:read', 'events:all', 'read'),
  ('events:registrations:read', 'events:registrations', 'read'),
  ('events:checkin:create', 'events:checkin', 'create'),
  ('events:checkin:read', 'events:checkin', 'read'),
  ('events:checkin:update', 'events:checkin', 'update'),
  ('events:view', 'events', 'view'),
  ('events:calendar:create', 'events:calendar', 'create'),
  ('events:calendar:update', 'events:calendar', 'update'),
  ('events:calendar:delete', 'events:calendar', 'delete'),
  ('events:all:create', 'events:all', 'create'),
  ('events:all:update', 'events:all', 'update'),
  ('events:all:delete', 'events:all', 'delete'),
  ('events:list:create', 'events:list', 'create'),
  ('events:list:update', 'events:list', 'update'),
  ('events:list:delete', 'events:list', 'delete'),
  ('events:checkin:delete', 'events:checkin', 'delete'),
  ('events:registrations:create', 'events:registrations', 'create'),
  ('events:registrations:update', 'events:registrations', 'update'),
  ('events:registrations:delete', 'events:registrations', 'delete'),
  ('events:tickets:create', 'events:tickets', 'create'),
  ('events:tickets:update', 'events:tickets', 'update'),
  ('events:tickets:delete', 'events:tickets', 'delete')
) AS grants(name, resource, action)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid()::text, r.id, p.id
FROM "roles" r CROSS JOIN "permissions" p
WHERE r.name = 'usher' AND r.church_id IS NULL
  AND p.name IN (
    'events:calendar:read',
    'events:list:read',
    'events:tickets:read',
    'events:create',
    'events:read',
    'events:update',
    'events:delete',
    'events:ticket-records:read',
    'events:all:read',
    'events:registrations:read',
    'events:checkin:create',
    'events:checkin:read',
    'events:checkin:update',
    'events:view',
    'events:calendar:create',
    'events:calendar:update',
    'events:calendar:delete',
    'events:all:create',
    'events:all:update',
    'events:all:delete',
    'events:list:create',
    'events:list:update',
    'events:list:delete',
    'events:checkin:delete',
    'events:registrations:create',
    'events:registrations:update',
    'events:registrations:delete',
    'events:tickets:create',
    'events:tickets:update',
    'events:tickets:delete'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
COMMIT;
