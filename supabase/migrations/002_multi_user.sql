-- Migration 002: Multi-user support
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS / IF NOT EXISTS column checks)

-- ── 1. Extend sources for private feeds ─────────────────────────────────────
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- All existing admin-managed sources become the global public catalog
UPDATE sources SET is_public = TRUE WHERE user_id IS NULL;

-- ── 2. User profiles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id        UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name   TEXT,
    is_admin       BOOLEAN NOT NULL DEFAULT FALSE,
    digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    digest_hour    INTEGER NOT NULL DEFAULT 19,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. User subscriptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
    user_id    UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id  TEXT    NOT NULL REFERENCES sources(id)   ON DELETE CASCADE,
    enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, source_id)
);

-- ── 4. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_source ON user_subscriptions(source_id);
CREATE INDEX IF NOT EXISTS idx_sources_user         ON sources(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sources_public       ON sources(is_public) WHERE is_public = TRUE;

-- ── 5. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources            ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights           ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts        ENABLE ROW LEVEL SECURITY;

-- user_profiles: each user can only see and edit their own row
CREATE POLICY IF NOT EXISTS "profiles_self_select" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "profiles_self_update" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

-- user_subscriptions: each user can only see and edit their own rows
CREATE POLICY IF NOT EXISTS "subscriptions_self_select" ON user_subscriptions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "subscriptions_self_insert" ON user_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "subscriptions_self_update" ON user_subscriptions
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "subscriptions_self_delete" ON user_subscriptions
  FOR DELETE USING (user_id = auth.uid());

-- sources: public catalog visible to all; private feeds visible only to owner
-- Service role (pipeline, admin API) bypasses RLS entirely.
CREATE POLICY IF NOT EXISTS "sources_read" ON sources
  FOR SELECT USING (is_public = TRUE OR user_id = auth.uid());

-- insights / episodes / transcripts: readable by all authenticated users
-- The service role writes them; anon read is fine for the public dashboard preview.
CREATE POLICY IF NOT EXISTS "insights_read_all" ON insights
  FOR SELECT USING (TRUE);
CREATE POLICY IF NOT EXISTS "episodes_read_all" ON episodes
  FOR SELECT USING (TRUE);
CREATE POLICY IF NOT EXISTS "transcripts_read_all" ON transcripts
  FOR SELECT USING (TRUE);

-- ── 6. After running this migration ─────────────────────────────────────────
-- 1. Register your admin account via /register in the dashboard.
-- 2. In Supabase Table Editor → user_profiles, set is_admin = true for your row.
-- 3. Remove ADMIN_SECRET from Vercel environment variables (no longer needed).
-- 4. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel.
