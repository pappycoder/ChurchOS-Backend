-- Analytics is reserved to the two administrator roles, including church-owned roles/overrides.
BEGIN;
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.name NOT IN ('church_admin', 'super_admin')
  AND p.name LIKE 'analytics:%';

DELETE FROM "church_role_permissions" crp
USING "permissions" p
WHERE crp.permission_id = p.id
  AND crp.role_name NOT IN ('church_admin', 'super_admin')
  AND p.name LIKE 'analytics:%';
COMMIT;
