-- Migration 017: English episode title
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS)

-- Some source feeds (e.g. Chinese-language podcast aggregators covering
-- English-language tech content) publish non-English episode titles. The
-- pipeline's LLM extraction step now also translates the title into English
-- as part of the same call; this column holds that translation. NULL means
-- not yet translated (older rows, pending backfill) — the dashboard falls
-- back to the original `title` in that case.
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS title_en TEXT;
