-- Form submissions intentionally have created_at and approved_at, but no
-- updated_at column. The legacy trigger raises 42703 on every status update,
-- preventing authorized approval/rejection despite correct permission grants.
DROP TRIGGER IF EXISTS set_updated_at_form_submissions ON form_submissions;
