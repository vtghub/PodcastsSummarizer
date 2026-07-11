-- Migration 020: Insight backfill job tracking
-- Supports re-running existing insights through the current LLM waterfall
-- (worker/jobs/backfill_insights.py) as a long-running, resumable background
-- job spanning multiple invocations/days, with admin-visible progress on the
-- /admin/task-status dashboard page.
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS backfill_jobs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type          TEXT        NOT NULL DEFAULT 'insight_reextraction',
  status            TEXT        NOT NULL DEFAULT 'running', -- running | completed | failed
  total_items       INT         NOT NULL DEFAULT 0,
  processed_items   INT         NOT NULL DEFAULT 0,
  succeeded_items   INT         NOT NULL DEFAULT 0,
  failed_items      INT         NOT NULL DEFAULT 0,
  batch_size        INT         NOT NULL DEFAULT 30,
  -- Resume cursor — insights are processed ordered by (created_at, id); the
  -- next batch selects rows strictly after this pair.
  cursor_created_at TIMESTAMPTZ,
  cursor_insight_id TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  last_error        TEXT
);

CREATE TABLE IF NOT EXISTS backfill_failures (
  id          BIGSERIAL   PRIMARY KEY,
  job_id      UUID        NOT NULL REFERENCES backfill_jobs(id) ON DELETE CASCADE,
  insight_id  TEXT        NOT NULL,
  episode_id  TEXT        NOT NULL,
  error_msg   TEXT,
  failed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backfill_failures_job ON backfill_failures(job_id, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_type_status ON backfill_jobs(job_type, status);

-- Admin-only visibility (reuses is_admin_user() from migration 016)
ALTER TABLE backfill_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backfill_failures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'backfill_jobs' AND policyname = 'backfill_jobs_admin_select'
  ) THEN
    CREATE POLICY "backfill_jobs_admin_select" ON backfill_jobs FOR SELECT USING (is_admin_user());
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'backfill_failures' AND policyname = 'backfill_failures_admin_select'
  ) THEN
    CREATE POLICY "backfill_failures_admin_select" ON backfill_failures FOR SELECT USING (is_admin_user());
  END IF;
END$$;

-- Realtime on backfill_jobs so the Task Status page updates live while a
-- batch is running, without polling.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'backfill_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE backfill_jobs;
  END IF;
END$$;
