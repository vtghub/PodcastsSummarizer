-- Migration 010: Insight bookmarks — per-user saved insights
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS insight_bookmarks (
  id          BIGSERIAL   PRIMARY KEY,
  insight_id  TEXT        NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (insight_id, user_id)
);

CREATE INDEX IF NOT EXISTS insight_bookmarks_user_idx
  ON insight_bookmarks (user_id, created_at DESC);

ALTER TABLE insight_bookmarks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_bookmarks' AND policyname='bookmarks_read_own') THEN
    CREATE POLICY "bookmarks_read_own"   ON insight_bookmarks FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_bookmarks' AND policyname='bookmarks_insert') THEN
    CREATE POLICY "bookmarks_insert"     ON insight_bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_bookmarks' AND policyname='bookmarks_delete') THEN
    CREATE POLICY "bookmarks_delete"     ON insight_bookmarks FOR DELETE USING (auth.uid() = user_id);
  END IF;
END$$;
