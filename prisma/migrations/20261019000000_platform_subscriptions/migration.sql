CREATE TYPE "SubscriptionPlan" AS ENUM ('essentials','community','network','enterprise');
CREATE TYPE "BillingCycle" AS ENUM ('monthly','annual');
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('pending','success','failed','reversed');
CREATE TYPE "SubscriptionGateway" AS ENUM ('paystack','flutterwave');
CREATE TABLE "platform_subscriptions" (
 church_id TEXT PRIMARY KEY REFERENCES churches(id) ON DELETE CASCADE ON UPDATE CASCADE,
 plan "SubscriptionPlan" NOT NULL,
 cycle "BillingCycle" NOT NULL,
 paid_until TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "subscription_payments" (
 reference TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 gateway "SubscriptionGateway" NOT NULL,
 plan "SubscriptionPlan" NOT NULL,
 cycle "BillingCycle" NOT NULL,
 amount INTEGER NOT NULL CHECK (amount > 0), currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
 status "SubscriptionPaymentStatus" NOT NULL DEFAULT 'pending',
 checkout_url TEXT, verified_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX subscription_payments_church_id_created_at_idx ON subscription_payments(church_id, created_at);
CREATE UNIQUE INDEX subscription_payments_one_pending ON subscription_payments(church_id) WHERE status = 'pending';
ALTER TABLE platform_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_subscriptions, subscription_payments FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON platform_subscriptions, subscription_payments FROM anon; END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON platform_subscriptions, subscription_payments FROM authenticated; END IF;
END $$;
INSERT INTO permissions (id,name,resource,action)
SELECT gen_random_uuid()::text,'billing:'||a,'billing',a FROM unnest(ARRAY['view','create','read','update','delete']) a ON CONFLICT(name) DO NOTHING;
INSERT INTO role_permissions(id,role_id,permission_id)
SELECT gen_random_uuid()::text,r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.church_id IS NULL AND r.name IN ('church_admin','super_admin') AND p.resource='billing'
ON CONFLICT(role_id,permission_id) DO NOTHING;
