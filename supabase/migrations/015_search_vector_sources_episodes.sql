-- Migration 015: Extend search_vector to include episode title + source name
-- This makes searching by podcast channel name, episode name, or guest name work naturally.
-- Run in Supabase SQL editor: Database → SQL Editor → New query

-- 1. Replace the trigger function to include episode title and source name
CREATE OR REPLACE FUNCTION insights_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      coalesce(NEW.summary, '') || ' ' ||
      coalesce((SELECT string_agg(v, ' ') FROM jsonb_array_elements_text(NEW.key_points)   AS t(v)), '') || ' ' ||
      coalesce((SELECT string_agg(v, ' ') FROM jsonb_array_elements_text(NEW.key_quotes)   AS t(v)), '') || ' ' ||
      coalesce((SELECT string_agg(v, ' ') FROM jsonb_array_elements_text(NEW.action_items) AS t(v)), '') || ' ' ||
      coalesce((SELECT string_agg(v, ' ') FROM jsonb_array_elements_text(NEW.tags)         AS t(v)), '') || ' ' ||
      coalesce((SELECT title FROM episodes WHERE id = NEW.episode_id), '') || ' ' ||
      coalesce((SELECT name  FROM sources  WHERE id = NEW.source_id),  '')
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop + recreate trigger so it also fires when episode_id or source_id changes
DROP TRIGGER IF EXISTS insights_search_vector_trigger ON insights;

CREATE TRIGGER insights_search_vector_trigger
  BEFORE INSERT OR UPDATE OF summary, key_points, key_quotes, action_items, tags, episode_id, source_id
  ON insights
  FOR EACH ROW EXECUTE FUNCTION insights_search_vector_update();

-- 3. Backfill all existing rows
UPDATE insights SET summary = summary;
