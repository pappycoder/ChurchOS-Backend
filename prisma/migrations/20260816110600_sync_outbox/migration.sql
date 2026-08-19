-- ChurchOS Offline Sync Outbox Trigger
-- Migration: 20260816110600_sync_outbox

-- ============================================================
-- 1. Sync Outbox Trigger Function
-- Records every mutation on the core sync tables into sync_queue
-- so offline clients can pull server-side changes as a delta.
--
-- Suppression: a session-level GUC (app.sync_outbox.skip) set to
-- 'true' makes the trigger a no-op. The SyncService sets this inside
-- its push transaction so changes applied on behalf of a client are
-- recorded once by the service itself (not double-queued here).
--
-- entity/action are normalized to the client wire contract:
--   table name      -> entity (singular / camelCase)
--   TG_OP           -> create | update | delete
-- ============================================================
CREATE OR REPLACE FUNCTION sync_outbox_event()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_entity TEXT;
  v_entity_id TEXT;
  v_church_id TEXT;
  v_data JSONB;
BEGIN
  IF current_setting('app.sync_outbox.skip', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_entity_id := NEW.id;
    v_church_id := NEW.church_id;
    v_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_entity_id := NEW.id;
    v_church_id := NEW.church_id;
    v_data := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_entity_id := OLD.id;
    v_church_id := OLD.church_id;
    v_data := to_jsonb(OLD);
  END IF;

  v_entity := CASE TG_TABLE_NAME
    WHEN 'members' THEN 'member'
    WHEN 'services' THEN 'service'
    WHEN 'attendance' THEN 'attendance'
    WHEN 'giving_categories' THEN 'givingCategory'
    WHEN 'transactions' THEN 'transaction'
    WHEN 'event_registrations' THEN 'eventRegistration'
    WHEN 'sermon_bookmarks' THEN 'sermonBookmark'
    WHEN 'life_events' THEN 'lifeEvent'
    WHEN 'visitors' THEN 'visitor'
    ELSE TG_TABLE_NAME
  END;

  INSERT INTO sync_queue (id, church_id, entity, entity_id, action, data, synced, created_at)
  VALUES (
    gen_random_uuid()::TEXT,
    v_church_id,
    v_entity,
    v_entity_id,
    v_action,
    v_data,
    FALSE,
    NOW()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Apply the outbox trigger to the core sync tables
-- ============================================================
CREATE TRIGGER sync_outbox_members
  AFTER INSERT OR UPDATE OR DELETE ON members
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();

CREATE TRIGGER sync_outbox_services
  AFTER INSERT OR UPDATE OR DELETE ON services
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();

CREATE TRIGGER sync_outbox_attendance
  AFTER INSERT OR UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();

CREATE TRIGGER sync_outbox_giving_categories
  AFTER INSERT OR UPDATE OR DELETE ON giving_categories
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();

CREATE TRIGGER sync_outbox_transactions
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();

CREATE TRIGGER sync_outbox_event_registrations
  AFTER INSERT OR UPDATE OR DELETE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();

CREATE TRIGGER sync_outbox_sermon_bookmarks
  AFTER INSERT OR UPDATE OR DELETE ON sermon_bookmarks
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();

CREATE TRIGGER sync_outbox_life_events
  AFTER INSERT OR UPDATE OR DELETE ON life_events
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();

CREATE TRIGGER sync_outbox_visitors
  AFTER INSERT OR UPDATE OR DELETE ON visitors
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_event();
