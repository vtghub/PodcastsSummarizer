-- Full-text search on insights
-- Run once in the Supabase SQL Editor.

-- 1. Add the search vector column
ALTER TABLE insights
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Trigger function to keep it up to date
CREATE OR REPLACE FUNCTION insights_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      coalesce(NEW.summary, '') || ' ' ||
      coalesce((SELECT string_agg(v, ' ') FROM jsonb_array_elements_text(NEW.key_points)   AS t(v)), '') || ' ' ||
      coalesce((SELECT string_agg(v, ' ') FROM jsonb_array_elements_text(NEW.key_quotes)   AS t(v)), '') || ' ' ||
      coalesce((SELECT string_agg(v, ' ') FROM jsonb_array_elements_text(NEW.action_items) AS t(v)), '') || ' ' ||
      coalesce((SELECT string_agg(v, ' ') FROM jsonb_array_elements_text(NEW.tags)         AS t(v)), '')
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER insights_search_vector_trigger
  BEFORE INSERT OR UPDATE OF summary, key_points, key_quotes, action_items, tags
  ON insights
  FOR EACH ROW EXECUTE FUNCTION insights_search_vector_update();

-- 3. Backfill existing rows
UPDATE insights SET summary = summary;

-- 4. GIN index for fast full-text lookups
CREATE INDEX IF NOT EXISTS idx_insights_search_vector
  ON insights USING GIN (search_vector);
