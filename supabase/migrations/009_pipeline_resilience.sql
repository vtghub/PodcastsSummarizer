-- Migration 009: Pipeline resilience
-- Adds episode retry tracking, per-source fetch backoff, and platform-links retry timestamp.
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- Episode queue: track retry attempts and delay next retry
ALTER TABLE episode_queue
  ADD COLUMN IF NOT EXISTS retry_count     INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_after     TIMESTAMPTZ;

-- Sources: exponential backoff when feed returns 429/503
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS backoff_until             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fetch_error_count         INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_links_attempted_at TIMESTAMPTZ;
