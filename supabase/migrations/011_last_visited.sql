-- Migration 011: Track last dashboard visit per user
-- Used to compute "new since last visit" insight count badge in the NavBar.
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_visited_at TIMESTAMPTZ;
