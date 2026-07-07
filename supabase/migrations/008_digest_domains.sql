-- Per-user domain filter for email digest
-- NULL means "all domains" (default behaviour, backward compatible).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS digest_domains text[] DEFAULT NULL;
