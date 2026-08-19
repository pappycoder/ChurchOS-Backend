-- ChurchOS Database Functions, Triggers, and Indexes
-- Migration: 20260722080000_add_audit_trigger_archive_functions_risk_index

-- ============================================================
-- 1. Audit Log Trigger Function
-- Automatically logs mutations on critical tables to audit_logs
-- Acts as a safety net alongside the app-level AuditLoggingService
-- ============================================================
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_entity TEXT;
  v_entity_id TEXT;
  v_old JSONB;
  v_new JSONB;
  v_church_id TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_entity := TG_TABLE_NAME;
    v_entity_id := NEW.id;
    v_church_id := NEW.church_id;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_entity := TG_TABLE_NAME;
    v_entity_id := NEW.id;
    v_church_id := NEW.church_id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_entity := TG_TABLE_NAME;
    v_entity_id := OLD.id;
    v_church_id := OLD.church_id;
    v_old := to_jsonb(OLD);
  END IF;

  INSERT INTO audit_logs (id, church_id, action, entity, entity_id, old_values, new_values, created_at)
  VALUES (
    gen_random_uuid()::TEXT,
    v_church_id,
    v_action,
    v_entity,
    v_entity_id,
    v_old,
    v_new,
    NOW()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to critical tables
CREATE TRIGGER audit_log_members
  AFTER INSERT OR UPDATE OR DELETE ON members
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_log_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_log_transactions
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ============================================================
-- 2. Archive Functions
-- Move old records to archive tables for compliance and performance
-- ============================================================

-- Archive attendance records older than 2 years
CREATE TABLE IF NOT EXISTS attendance_archive (LIKE attendance INCLUDING ALL);

CREATE OR REPLACE FUNCTION archive_old_attendance()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  WITH moved AS (
    DELETE FROM attendance
    WHERE checkin_at < NOW() - INTERVAL '2 years'
    RETURNING *
  )
  INSERT INTO attendance_archive
  SELECT * FROM moved;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Archive messages older than 1 year
CREATE TABLE IF NOT EXISTS messages_archive (LIKE messages INCLUDING ALL);

CREATE OR REPLACE FUNCTION archive_old_messages()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  WITH moved AS (
    DELETE FROM messages
    WHERE created_at < NOW() - INTERVAL '1 year'
    RETURNING *
  )
  INSERT INTO messages_archive
  SELECT * FROM moved;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. At-Risk Members Partial Index
-- Optimizes queries for members needing pastoral attention
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_risk_scores_high_risk
  ON risk_scores (church_id, member_id, score)
  WHERE level IN ('high', 'critical');
