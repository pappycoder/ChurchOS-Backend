-- Keep SQL and application eligibility aligned. Rows already stored are retained.
CREATE OR REPLACE FUNCTION churchos_has_feature(church TEXT, feature TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT COALESCE((SELECT paid_until > CURRENT_TIMESTAMP AND
  CASE WHEN feature IN ('giving','events','groups','forms','reports','email','media') THEN plan IN ('community','network','enterprise')
       WHEN feature IN ('tickets','pastoral','assets','analytics','sms','whatsapp','calls','webhooks') THEN plan IN ('network','enterprise') ELSE FALSE END
 FROM platform_subscriptions WHERE church_id=church),FALSE)
$$;

CREATE FUNCTION churchos_check_media_plan() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE feature TEXT;
BEGIN
 IF NEW.folder IN ('profiles','churches','branches') THEN RETURN NEW; END IF;
 feature := CASE WHEN NEW.folder='assets' THEN 'assets'
                 WHEN NEW.folder='form-attachments' THEN 'forms' ELSE 'media' END;
 IF NOT churchos_has_feature(NEW.church_id,feature) THEN
   RAISE EXCEPTION 'PLAN_FEATURE_REQUIRED:%',feature USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER churchos_media_feature BEFORE INSERT ON media_assets
FOR EACH ROW EXECUTE FUNCTION churchos_check_media_plan();
CREATE TRIGGER churchos_sermons_feature BEFORE INSERT ON sermons
FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('media');
CREATE TRIGGER churchos_webhooks_feature BEFORE INSERT ON webhook_subscriptions
FOR EACH ROW EXECUTE FUNCTION churchos_check_feature('webhooks');

CREATE FUNCTION churchos_check_paid_event_plan() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (NOT NEW.is_free OR COALESCE(NEW.price,0)>0) AND NOT churchos_has_feature(NEW.church_id,'tickets') THEN
   RAISE EXCEPTION 'PLAN_FEATURE_REQUIRED:tickets' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER churchos_paid_events_feature BEFORE INSERT OR UPDATE OF is_free,price ON events
FOR EACH ROW EXECUTE FUNCTION churchos_check_paid_event_plan();
