-- Admin-controlled per-user toggle for the Weekly Recommendations email,
-- independent of digest_enabled (which gates the daily/hourly digest).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS weekly_recommendations_enabled BOOLEAN NOT NULL DEFAULT TRUE;
