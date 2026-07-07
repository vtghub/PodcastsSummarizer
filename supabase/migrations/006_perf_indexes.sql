-- Phase 1 performance indexes
-- Run once against your Supabase project (SQL Editor or psql).
-- CONCURRENTLY means the table stays readable during index build.

-- Primary dashboard query: insights by date, filtered by source_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_date_source_id
  ON insights (date, source_id);

-- Episode-level queries: insights grouped by source + episode
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_source_episode
  ON insights (source_id, episode_id);

-- Available-dates query: distinct dates for a set of source_ids
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_source_date
  ON insights (source_id, date);
