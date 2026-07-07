-- Migration 005: Insight engagement — views, reactions, comments, comment reactions
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE)

-- ── Views ────────────────────────────────────────────────────────────────────
-- One row per (insight_id, viewer). user_id is NULL for anonymous viewers.
-- A unique constraint on (insight_id, user_id) prevents double-counting for
-- signed-in users; anonymous views are always counted (no dedup).
CREATE TABLE IF NOT EXISTS insight_views (
  id          BIGSERIAL   PRIMARY KEY,
  insight_id  TEXT        NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS insight_views_user_uniq
  ON insight_views (insight_id, user_id)
  WHERE user_id IS NOT NULL;

-- ── Reactions on insights ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insight_reactions (
  id          BIGSERIAL   PRIMARY KEY,
  insight_id  TEXT        NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('like', 'dislike')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (insight_id, user_id)
);

-- ── Comments on insights ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insight_comments (
  id          BIGSERIAL   PRIMARY KEY,
  insight_id  TEXT        NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Reactions on comments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_reactions (
  id          BIGSERIAL   PRIMARY KEY,
  comment_id  BIGINT      NOT NULL REFERENCES insight_comments(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('like', 'dislike')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, user_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE insight_views      ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reactions  ENABLE ROW LEVEL SECURITY;

-- Views: anyone can read counts; authed users can insert their own row
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_views' AND policyname='views_public_read') THEN
    CREATE POLICY "views_public_read" ON insight_views FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_views' AND policyname='views_insert') THEN
    CREATE POLICY "views_insert" ON insight_views FOR INSERT WITH CHECK (true);
  END IF;
END$$;

-- Reactions: public read; authed users manage their own row
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_reactions' AND policyname='reactions_public_read') THEN
    CREATE POLICY "reactions_public_read" ON insight_reactions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_reactions' AND policyname='reactions_insert') THEN
    CREATE POLICY "reactions_insert" ON insight_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_reactions' AND policyname='reactions_update') THEN
    CREATE POLICY "reactions_update" ON insight_reactions FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_reactions' AND policyname='reactions_delete') THEN
    CREATE POLICY "reactions_delete" ON insight_reactions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END$$;

-- Comments: public read; authed users manage their own rows
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_comments' AND policyname='comments_public_read') THEN
    CREATE POLICY "comments_public_read" ON insight_comments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_comments' AND policyname='comments_insert') THEN
    CREATE POLICY "comments_insert" ON insight_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_comments' AND policyname='comments_update') THEN
    CREATE POLICY "comments_update" ON insight_comments FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insight_comments' AND policyname='comments_delete') THEN
    CREATE POLICY "comments_delete" ON insight_comments FOR DELETE USING (auth.uid() = user_id);
  END IF;
END$$;

-- Comment reactions: public read; authed users manage their own rows
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comment_reactions' AND policyname='creactions_public_read') THEN
    CREATE POLICY "creactions_public_read" ON comment_reactions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comment_reactions' AND policyname='creactions_insert') THEN
    CREATE POLICY "creactions_insert" ON comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comment_reactions' AND policyname='creactions_update') THEN
    CREATE POLICY "creactions_update" ON comment_reactions FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comment_reactions' AND policyname='creactions_delete') THEN
    CREATE POLICY "creactions_delete" ON comment_reactions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END$$;
