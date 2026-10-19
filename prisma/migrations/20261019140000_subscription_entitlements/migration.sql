BEGIN;
ALTER TABLE platform_subscriptions ADD COLUMN period_started_at TIMESTAMP(3), ADD COLUMN scheduled_plan "SubscriptionPlan", ADD COLUMN scheduled_cycle "BillingCycle", ADD COLUMN enterprise_limits JSONB;
ALTER TABLE subscription_payments ADD COLUMN intent TEXT NOT NULL DEFAULT 'renewal', ADD COLUMN base_plan "SubscriptionPlan", ADD COLUMN base_paid_until TIMESTAMP(3), ADD COLUMN target_paid_until TIMESTAMP(3), ADD COLUMN application_status TEXT NOT NULL DEFAULT 'pending';
UPDATE subscription_payments SET application_status='applied' WHERE status='success';
CREATE TABLE staff_invitation_reservations (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
 email TEXT NOT NULL, expires_at TIMESTAMP(3) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(church_id,email)
);
CREATE INDEX ON staff_invitation_reservations(church_id,expires_at);
ALTER TABLE staff_invitation_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON staff_invitation_reservations FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON staff_invitation_reservations FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON staff_invitation_reservations FROM authenticated; END IF;
END $$;

CREATE FUNCTION churchos_plan_limit(church TEXT, resource TEXT) RETURNS INTEGER
LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE p TEXT; agreement JSONB;
BEGIN
 SELECT plan::text,enterprise_limits INTO p,agreement FROM platform_subscriptions WHERE church_id=church;
 IF p='enterprise' THEN
   IF jsonb_typeof(agreement->resource)='number' AND (agreement->>resource) ~ '^[0-9]+$' THEN RETURN (agreement->>resource)::INTEGER; END IF;
   RETURN 0;
 END IF;
 IF p IS NULL THEN RETURN 0; END IF;
 RETURN CASE resource
 WHEN 'members' THEN CASE p WHEN 'essentials' THEN 100 WHEN 'community' THEN 300 ELSE 1500 END
 WHEN 'staff' THEN CASE p WHEN 'essentials' THEN 2 WHEN 'community' THEN 5 ELSE 15 END
 WHEN 'locations' THEN CASE p WHEN 'network' THEN 3 ELSE 1 END
 ELSE 0 END;
END $$;
CREATE FUNCTION churchos_has_feature(church TEXT, feature TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT COALESCE((SELECT paid_until > CURRENT_TIMESTAMP AND
  CASE WHEN feature IN ('giving','events','groups','forms','reports','email') THEN plan IN ('community','network','enterprise')
       WHEN feature IN ('tickets','pastoral','assets','analytics','sms','whatsapp','calls') THEN plan IN ('network','enterprise') ELSE FALSE END
 FROM platform_subscriptions WHERE church_id=church),FALSE)
$$;

CREATE TABLE subscription_alert_keys (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 resource TEXT NOT NULL, threshold INTEGER NOT NULL, period_end TIMESTAMP(3) NOT NULL,
 UNIQUE(church_id,profile_id,resource,threshold,period_end)
);
ALTER TABLE subscription_alert_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON subscription_alert_keys FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON subscription_alert_keys FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON subscription_alert_keys FROM authenticated; END IF;
END $$;
CREATE FUNCTION churchos_notify_subscription(church TEXT, resource_name TEXT, band INTEGER, used_count BIGINT, allowance INTEGER) RETURNS VOID
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE period TIMESTAMP(3);
BEGIN
 SELECT paid_until INTO period FROM platform_subscriptions WHERE church_id=church;
 IF period IS NULL THEN RETURN; END IF;
 WITH fresh AS (
  INSERT INTO subscription_alert_keys(id,church_id,profile_id,resource,threshold,period_end)
  SELECT md5(random()::text||clock_timestamp()::text||p.id),church,p.id,resource_name,band,period
  FROM profiles p WHERE p.church_id=church AND p.status='active' AND p.archived_at IS NULL
   AND p.role && ARRAY['church_admin','super_admin']::TEXT[]
  ON CONFLICT DO NOTHING RETURNING profile_id
 ) INSERT INTO notifications(id,church_id,profile_id,type,title,body,data,created_at)
 SELECT md5(random()::text||clock_timestamp()::text||profile_id),church,profile_id,'system',
 CASE WHEN resource_name='renewal' THEN 'Subscription renewal reminder' ELSE 'Subscription allowance: '||resource_name END,
 CASE WHEN resource_name='renewal' THEN 'Your ChurchOS subscription is due for manual renewal within seven days.' ELSE used_count||' of '||allowance||' '||resource_name||' used. Review Plan & Billing.' END,
 jsonb_build_object('url','/subscription','resource',resource_name,'threshold',band),CURRENT_TIMESTAMP FROM fresh;
END $$;
CREATE FUNCTION churchos_notify_renewal(church TEXT) RETURNS VOID
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM platform_subscriptions WHERE church_id=church AND paid_until <= CURRENT_TIMESTAMP+interval '7 days') THEN
  PERFORM churchos_notify_subscription(church,'renewal',7,0,0);
 END IF;
END $$;

-- Every writer, including imports, offline synchronization and administration scripts,
-- serializes capacity-increasing operations on the same church row as billing.
CREATE FUNCTION churchos_check_capacity() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE resource TEXT; used_count BIGINT; allowance INTEGER; increasing BOOLEAN; own_email TEXT;
BEGIN
 IF TG_OP='UPDATE' AND NEW.church_id <> OLD.church_id THEN RAISE EXCEPTION 'Church ownership cannot be changed'; END IF;
 IF TG_TABLE_NAME='members' THEN
  resource:='members'; increasing:=NEW.archived_at IS NULL;
  IF TG_OP='UPDATE' THEN increasing:=increasing AND OLD.archived_at IS NOT NULL; END IF;
 ELSIF TG_TABLE_NAME='branches' THEN
  resource:='locations'; increasing:=NEW.archived_at IS NULL;
  IF TG_OP='UPDATE' THEN increasing:=increasing AND OLD.archived_at IS NOT NULL; END IF;
 ELSIF TG_TABLE_NAME='profiles' THEN
  resource:='staff'; increasing:=NEW.archived_at IS NULL AND NEW.status='active' AND cardinality(NEW.role)>0;
  IF TG_OP='UPDATE' THEN increasing:=increasing AND (OLD.archived_at IS NOT NULL OR OLD.status<>'active' OR cardinality(OLD.role)=0); END IF;
  own_email:=lower(NEW.email);
 ELSE
  resource:='staff'; increasing:=NEW.expires_at > CURRENT_TIMESTAMP; own_email:=lower(NEW.email);
 END IF;
 IF NOT increasing THEN RETURN NEW; END IF;
 PERFORM id FROM churches WHERE id=NEW.church_id FOR UPDATE;
 allowance:=churchos_plan_limit(NEW.church_id,resource);
 IF resource='members' THEN SELECT count(*) INTO used_count FROM members WHERE church_id=NEW.church_id AND archived_at IS NULL;
 ELSIF resource='locations' THEN SELECT count(*) INTO used_count FROM branches WHERE church_id=NEW.church_id AND archived_at IS NULL;
 ELSE
  SELECT count(*) INTO used_count FROM profiles WHERE church_id=NEW.church_id AND archived_at IS NULL AND status='active' AND cardinality(role)>0;
  used_count:=used_count+(SELECT count(*) FROM staff_invitation_reservations WHERE church_id=NEW.church_id AND expires_at>CURRENT_TIMESTAMP AND lower(email) IS DISTINCT FROM own_email);
  -- An invitation for an already-enabled profile must not reserve another seat.
  IF TG_TABLE_NAME='staff_invitation_reservations' AND EXISTS(SELECT 1 FROM profiles WHERE church_id=NEW.church_id AND lower(email)=own_email AND status='active' AND archived_at IS NULL) THEN RAISE EXCEPTION 'A staff account already exists for this email'; END IF;
 END IF;
 IF used_count>=allowance THEN RAISE EXCEPTION 'PLAN_LIMIT_REACHED:%',resource USING ERRCODE='P0001'; END IF;
 IF resource IN ('members','staff') AND allowance>0 AND (used_count+1)::numeric/allowance >= .8 THEN
  PERFORM churchos_notify_subscription(NEW.church_id,resource,CASE WHEN used_count+1>=allowance THEN 100 WHEN (used_count+1)::numeric/allowance>=.9 THEN 90 ELSE 80 END,used_count+1,allowance);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER churchos_member_capacity BEFORE INSERT OR UPDATE ON members FOR EACH ROW EXECUTE FUNCTION churchos_check_capacity();
CREATE TRIGGER churchos_location_capacity BEFORE INSERT OR UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION churchos_check_capacity();
CREATE TRIGGER churchos_staff_capacity BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION churchos_check_capacity();
CREATE TRIGGER churchos_invitation_capacity BEFORE INSERT OR UPDATE ON staff_invitation_reservations FOR EACH ROW EXECUTE FUNCTION churchos_check_capacity();

CREATE FUNCTION churchos_check_feature() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE church TEXT; feature TEXT:=TG_ARGV[0];
BEGIN
 -- Archiving/reducing retained data is allowed after a downgrade.
 IF TG_OP='UPDATE' AND to_jsonb(NEW)->>'archived_at' IS NOT NULL THEN RETURN NEW; END IF;
 church:=to_jsonb(NEW)->>'church_id';
 IF church IS NULL AND TG_TABLE_NAME='tickets' THEN
 SELECT church_id INTO church FROM events WHERE id=NEW.event_id;
 IF NEW.registration_id IS NOT NULL AND NEW.payment_reference IS NOT NULL AND EXISTS(
  SELECT 1 FROM event_registrations r WHERE r.id=NEW.registration_id AND r.church_id=church
   AND r.payment_status='paid' AND r.payment_reference=NEW.payment_reference AND r.transaction_id=NEW.transaction_id
 ) THEN RETURN NEW; END IF;
 IF COALESCE(NEW.price_paid,0)=0 AND NEW.registration_id IS NOT NULL THEN feature:='events'; END IF;
 END IF;
 -- A charge accepted just before expiry still needs its immutable financial record.
 IF TG_TABLE_NAME='transactions' THEN
 IF NEW.type='digital' AND NEW.integration_account_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM recurring_giving r WHERE r.id=NEW.metadata->>'recurring_giving_id'
   AND r.church_id=church AND r.integration_account_id=NEW.integration_account_id AND r.authorization_code IS NOT NULL
 ) THEN RETURN NEW; END IF;
 END IF;
 IF NOT churchos_has_feature(church,feature) THEN RAISE EXCEPTION 'PLAN_FEATURE_REQUIRED:%',feature USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
-- Insert protection covers public/service/worker paths too. Historical reads and
-- payment reconciliation updates remain possible after expiry or downgrade.
CREATE TRIGGER churchos_transactions_feature BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('giving');
CREATE TRIGGER churchos_events_feature BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('events');
CREATE TRIGGER churchos_registrations_feature BEFORE INSERT ON event_registrations FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('events');
CREATE TRIGGER churchos_tickets_feature BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('tickets');
CREATE TRIGGER churchos_forms_feature BEFORE INSERT ON forms FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('forms');
CREATE TRIGGER churchos_submissions_feature BEFORE INSERT ON form_submissions FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('forms');
CREATE TRIGGER churchos_departments_feature BEFORE INSERT ON departments FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('groups');
CREATE TRIGGER churchos_cellgroups_feature BEFORE INSERT ON cell_groups FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('groups');
CREATE TRIGGER churchos_assets_feature BEFORE INSERT ON assets FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('assets');
CREATE TRIGGER churchos_pastoral_feature BEFORE INSERT ON pastoral_notes FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('pastoral');
CREATE TRIGGER churchos_appointments_feature BEFORE INSERT ON appointments FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('pastoral');
COMMIT;
