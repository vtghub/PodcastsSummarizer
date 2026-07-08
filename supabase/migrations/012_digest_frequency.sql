-- Phase 15: digest_frequency + digest_day_of_week on user_profiles
-- digest_frequency: 'daily' (default) or 'weekly'
-- digest_day_of_week: 0=Monday … 6=Sunday (Python weekday convention)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS digest_frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (digest_frequency IN ('daily', 'weekly')),
  ADD COLUMN IF NOT EXISTS digest_day_of_week INT NOT NULL DEFAULT 0
    CHECK (digest_day_of_week >= 0 AND digest_day_of_week <= 6);
