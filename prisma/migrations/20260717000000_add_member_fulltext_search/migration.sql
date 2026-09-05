-- Full-text search index for members
-- Enables fast search across first_name, last_name, email, and phone

CREATE INDEX idx_members_fulltext ON members
  USING GIN (to_tsvector('english', first_name || ' ' || last_name));

-- Additional index for case-insensitive email search
CREATE INDEX idx_members_email_lower ON members (LOWER(email)) WHERE email IS NOT NULL;
