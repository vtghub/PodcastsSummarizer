-- Add timezone preference to user digest settings
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS digest_timezone TEXT NOT NULL DEFAULT 'America/New_York';
