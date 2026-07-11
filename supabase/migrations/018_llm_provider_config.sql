-- Migration 018: LLM provider waterfall config
-- Lets the /admin/llm-providers page enable/disable and reorder which LLM
-- providers the worker's extraction waterfall uses, without a code change
-- or deploy. The worker only knows how to build providers it has adapter
-- code for (see worker/providers/llm/provider_registry.py) — this table
-- just controls which of those known providers are active and in what
-- order, not what providers exist at all.
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS llm_provider_config (
  provider_key TEXT        PRIMARY KEY,   -- matches PROVIDER_SLOTS[].key in code
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  priority     INTEGER     NOT NULL DEFAULT 100,  -- lower = tried earlier in the waterfall
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE llm_provider_config ENABLE ROW LEVEL SECURITY;

-- Reuses is_admin_user() from migration 016. Only the API route (service_role,
-- bypasses RLS) writes to this table — the SELECT policy is defense-in-depth
-- in case it's ever queried with a user-scoped key.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'llm_provider_config' AND policyname = 'llm_provider_config_admin_select'
  ) THEN
    CREATE POLICY "llm_provider_config_admin_select" ON llm_provider_config
      FOR SELECT USING (is_admin_user());
  END IF;
END$$;
