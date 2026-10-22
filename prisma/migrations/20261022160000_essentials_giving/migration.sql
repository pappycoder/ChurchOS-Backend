-- Giving and church payment accounts are included in every active paid plan.
-- Keep the existing guards/triggers and other feature tiers intact.
CREATE OR REPLACE FUNCTION churchos_has_feature(church TEXT, feature TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT COALESCE((SELECT paid_until > CURRENT_TIMESTAMP AND
  CASE WHEN feature = 'giving' THEN plan IN ('essentials','community','network','enterprise')
       WHEN feature IN ('events','groups','forms','reports','email','media') THEN plan IN ('community','network','enterprise')
       WHEN feature IN ('tickets','pastoral','assets','analytics','sms','whatsapp','calls','webhooks') THEN plan IN ('network','enterprise') ELSE FALSE END
 FROM platform_subscriptions WHERE church_id=church),FALSE)
$$;
