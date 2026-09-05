-- ChurchOS Database Functions, Triggers, and Partial Indexes
-- Migration: 20260722070000_add_db_functions_triggers_indexes

-- ============================================================
-- 1. updated_at Trigger Function
-- Automatically sets updated_at to NOW() on row update
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all models with updated_at columns
CREATE TRIGGER set_updated_at_members
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_branches
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_events
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_transactions
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_churches
  BEFORE UPDATE ON churches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_visitors
  BEFORE UPDATE ON visitors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_custom_field_definitions
  BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_templates
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_form_submissions
  BEFORE UPDATE ON form_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_broadcasts
  BEFORE UPDATE ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. Receipt Number Sequence
-- Generates sequential receipt numbers: {YEAR}/{PREFIX}/{SEQ}
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq
  INCREMENT BY 1
  START WITH 1
  NO MAXVALUE
  CACHE 10;

CREATE OR REPLACE FUNCTION generate_receipt_number(prefix TEXT)
RETURNS TEXT AS $$
DECLARE
  seq_val BIGINT;
  yr TEXT;
BEGIN
  yr := TO_CHAR(NOW(), 'YYYY');
  seq_val := nextval('receipt_number_seq');
  RETURN yr || '/' || prefix || '/' || LPAD(seq_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Attendance Duplicate Prevention Trigger
-- Prevents duplicate check-ins for the same member at the same service
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_duplicate_attendance()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM attendance
    WHERE service_id = NEW.service_id
      AND member_id = NEW.member_id
  ) THEN
    RAISE EXCEPTION 'Member already checked in for this service';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_duplicate_attendance
  BEFORE INSERT ON attendance
  FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_attendance();

-- ============================================================
-- 4. Partial Indexes for Performance
-- ============================================================

-- Active members (most common query)
CREATE INDEX IF NOT EXISTS idx_members_active
  ON members (church_id, branch_id)
  WHERE status = 'active';

-- Pending form submissions
CREATE INDEX IF NOT EXISTS idx_form_submissions_pending
  ON form_submissions (church_id, form_id)
  WHERE status = 'pending';

-- Active recurring giving
CREATE INDEX IF NOT EXISTS idx_recurring_giving_active
  ON recurring_giving (church_id, member_id)
  WHERE is_active = true;

-- New visitors (follow-up funnel)
CREATE INDEX IF NOT EXISTS idx_visitors_new
  ON visitors (church_id, created_at)
  WHERE follow_up_status = 'new';

-- In-progress broadcasts
CREATE INDEX IF NOT EXISTS idx_broadcasts_in_progress
  ON broadcasts (church_id, created_at)
  WHERE status = 'in_progress';

-- Unread messages
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages (church_id, created_at)
  WHERE direction = 'inbound';

-- Active assets
CREATE INDEX IF NOT EXISTS idx_assets_active
  ON assets (church_id, status)
  WHERE status = 'active';

-- Scheduled maintenance
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_scheduled
  ON asset_maintenance (scheduled_date)
  WHERE status = 'scheduled';

-- ============================================================
-- 5. Visitor Auto-Status on Conversion
-- Sets follow_up_status to 'converted' when converted_member_id is set
-- ============================================================
CREATE OR REPLACE FUNCTION auto_set_converted_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.converted_member_id IS NOT NULL AND OLD.converted_member_id IS NULL THEN
    NEW.follow_up_status := 'converted';
    NEW.converted_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_visitor_converted_status
  BEFORE UPDATE ON visitors
  FOR EACH ROW EXECUTE FUNCTION auto_set_converted_status();
