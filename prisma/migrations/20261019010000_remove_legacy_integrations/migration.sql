-- Development cleanup: the current provider account/channel system is authoritative.
-- Keep historical migration files so existing installations can deploy normally.
DROP TABLE "messaging_integrations";
DELETE FROM church_role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE resource='messaging_integrations');
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE resource='messaging_integrations');
DELETE FROM permissions WHERE resource='messaging_integrations';
-- No implicit free access for churches created before subscription onboarding.
INSERT INTO platform_subscriptions(church_id,plan,cycle)
SELECT id,'essentials','monthly' FROM churches ON CONFLICT(church_id) DO NOTHING;
