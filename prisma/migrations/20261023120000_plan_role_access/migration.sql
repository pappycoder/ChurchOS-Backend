-- Plan role eligibility is enforced on new assignments; historical profiles/roles are retained.
CREATE OR REPLACE FUNCTION churchos_has_feature(church TEXT, feature TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT COALESCE((SELECT paid_until > CURRENT_TIMESTAMP AND
  CASE WHEN feature IN ('giving','reports') THEN plan IN ('essentials','community','network','enterprise')
       WHEN feature IN ('events','groups','forms','email','media','staff_roles') THEN plan IN ('community','network','enterprise')
       WHEN feature IN ('tickets','pastoral','assets','analytics','sms','whatsapp','calls','webhooks','custom_roles') THEN plan IN ('network','enterprise') ELSE FALSE END
 FROM platform_subscriptions WHERE church_id=church),FALSE)
$$;

CREATE FUNCTION churchos_check_role_plan() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE current_plan TEXT; selected_role TEXT;
BEGIN
 IF TG_TABLE_NAME='roles' THEN
  IF NEW.church_id IS NOT NULL AND NOT churchos_has_feature(NEW.church_id,'custom_roles') THEN
   RAISE EXCEPTION 'PLAN_FEATURE_REQUIRED:custom_roles' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.status<>'active' OR NEW.archived_at IS NOT NULL OR cardinality(NEW.role)=0 THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.role=OLD.role AND OLD.status='active' AND OLD.archived_at IS NULL THEN RETURN NEW; END IF;
 IF 'super_admin'=ANY(NEW.role) THEN RETURN NEW; END IF;
 SELECT plan::TEXT INTO current_plan FROM platform_subscriptions WHERE church_id=NEW.church_id;
 current_plan:=COALESCE(current_plan,'essentials');
 IF current_plan='essentials' THEN
  IF NEW.role=ARRAY['church_admin']::TEXT[] THEN
   IF TG_OP='UPDATE' AND 'church_admin'=ANY(OLD.role) THEN RETURN NEW; END IF;
   -- Registration may provision the first administrator before payment.
   PERFORM id FROM churches WHERE id=NEW.church_id FOR UPDATE;
   IF NOT EXISTS(SELECT 1 FROM profiles WHERE church_id=NEW.church_id AND 'church_admin'=ANY(role)) THEN RETURN NEW; END IF;
  END IF;
  IF cardinality(NEW.role)<>1 OR NOT (NEW.role <@ ARRAY['senior_pastor','branch_pastor','secretary']::TEXT[]) THEN
   RAISE EXCEPTION 'PLAN_FEATURE_REQUIRED:staff_roles' USING ERRCODE='P0001';
  END IF;
 ELSIF current_plan='community' THEN
  IF NOT (NEW.role <@ ARRAY['church_admin','senior_pastor','branch_pastor','secretary','treasurer','usher','department_head','cell_leader']::TEXT[]) THEN
   RAISE EXCEPTION 'PLAN_FEATURE_REQUIRED:custom_roles' USING ERRCODE='P0001';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER churchos_role_creation_plan BEFORE INSERT OR UPDATE ON roles
 FOR EACH ROW EXECUTE FUNCTION churchos_check_role_plan();
CREATE TRIGGER churchos_staff_role_plan BEFORE INSERT OR UPDATE OF role,status,archived_at ON profiles
 FOR EACH ROW EXECUTE FUNCTION churchos_check_role_plan();
