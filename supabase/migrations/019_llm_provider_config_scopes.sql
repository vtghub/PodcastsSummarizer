-- Migration 019: scope llm_provider_config per LLM-consuming feature
-- There are two independent places this app calls an LLM: the worker's
-- podcast insight extraction pipeline, and the dashboard's Ask AI chat
-- feature (/api/ask). They should be independently configurable — e.g.
-- Gemini enabled for extraction but disabled for chat, or a different
-- provider order for each — not share one flat enabled/priority per
-- provider_key.
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS / guarded DDL)

ALTER TABLE llm_provider_config ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'pipeline';

-- Existing rows (all from before this migration) were implicitly for the
-- pipeline extraction waterfall — the DEFAULT above backfills them correctly.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'llm_provider_config' AND constraint_type = 'PRIMARY KEY'
      AND constraint_name = 'llm_provider_config_pkey'
  ) THEN
    ALTER TABLE llm_provider_config DROP CONSTRAINT llm_provider_config_pkey;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'llm_provider_config' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE llm_provider_config ADD PRIMARY KEY (scope, provider_key);
  END IF;
END$$;
