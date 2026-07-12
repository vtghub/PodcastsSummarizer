-- Migration 021: Per-chunk extraction logging
-- Records each LLM call chunked_extract() makes while map-reducing a long
-- transcript — which chunk, which provider handled it, whether it
-- succeeded, and any error — so admins can see chunking/model detail per
-- episode on the /admin/task-status page, not just the final insight.
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS extraction_chunk_log (
  id            BIGSERIAL   PRIMARY KEY,
  episode_id    TEXT        NOT NULL,
  source_id     TEXT        NOT NULL,
  chunk_index   INT         NOT NULL,  -- 1-based; equals total_chunks for the final synthesis call
  total_chunks  INT         NOT NULL,
  phase         TEXT        NOT NULL,  -- 'summary' (per-chunk map step) | 'synthesis' (final reduce step)
  provider_name TEXT        NOT NULL,
  status        TEXT        NOT NULL,  -- 'success' | 'failed'
  error_msg     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_chunk_log_episode ON extraction_chunk_log(episode_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_extraction_chunk_log_created ON extraction_chunk_log(created_at DESC);

-- Admin-only visibility (reuses is_admin_user() from migration 016)
ALTER TABLE extraction_chunk_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'extraction_chunk_log' AND policyname = 'extraction_chunk_log_admin_select'
  ) THEN
    CREATE POLICY "extraction_chunk_log_admin_select" ON extraction_chunk_log FOR SELECT USING (is_admin_user());
  END IF;
END$$;
