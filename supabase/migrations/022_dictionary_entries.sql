-- Migration 022: English dictionary lookup table
-- Backs the insight card "look up a word" feature — a direct, local
-- retrieval lookup (no LLM call, no external API dependency at request
-- time). Seeded from the Princeton WordNet English lexical database via
-- worker/jobs/seed_dictionary.py (~130k rows — run once after this
-- migration; see that script's docstring for how to trigger it).
-- Run in Supabase SQL editor: Database → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS dictionary_entries (
  id          BIGSERIAL PRIMARY KEY,
  word        TEXT NOT NULL,
  pos         TEXT NOT NULL,  -- 'noun' | 'verb' | 'adjective' | 'adverb'
  definition  TEXT NOT NULL,
  examples    TEXT[] NOT NULL DEFAULT '{}',
  synonyms    TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (word, pos, definition)
);

-- Case-insensitive lookups are the only access pattern this table serves.
CREATE INDEX IF NOT EXISTS idx_dictionary_entries_word ON dictionary_entries (lower(word));

-- Public-readable, like insights — dictionary definitions aren't
-- user-specific or sensitive, and the lookup feature works for guests too.
ALTER TABLE dictionary_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dictionary_entries'
      AND policyname = 'dictionary_entries_public_read'
  ) THEN
    CREATE POLICY "dictionary_entries_public_read"
      ON dictionary_entries FOR SELECT
      USING (true);
  END IF;
END$$;
