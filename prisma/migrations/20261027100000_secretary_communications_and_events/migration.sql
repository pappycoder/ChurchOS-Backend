-- Add communication and event editing access to existing global Secretary templates only.
-- Fresh installations receive the same grants through the permission seed.
-- Keep church-owned roles, additive church overrides and other role mappings intact.
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid()::text, role.id, permission.id
FROM roles AS role
CROSS JOIN permissions AS permission
WHERE role.church_id IS NULL
  AND role.name = 'secretary'
  AND permission.name IN (
    'broadcasts:view', 'broadcasts:create', 'broadcasts:read',
    'whatsapp:view', 'whatsapp:create', 'whatsapp:read',
    'events:create', 'events:update'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
