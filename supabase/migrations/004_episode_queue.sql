-- Migration 004: Episode processing queue for async pipeline status signalling
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE)

CREATE TABLE IF NOT EXISTS episode_queue (
  episode_id  TEXT        PRIMARY KEY,
  source_id   TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending', -- pending | done | failed
  error_msg   TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow the dashboard (anon key) to read rows via Realtime
ALTER TABLE episode_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "episode_queue_public_read"
  ON episode_queue FOR SELECT
  USING (true);

-- Enable Realtime on this table (run once)
-- In Supabase dashboard: Database → Replication → Realtime → enable episode_queue
