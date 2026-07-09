-- Backfill insight dates to match the episode's published_at date.
-- Previously, insights were stored with the pipeline run date (today).
-- Going forward the pipeline uses episode.published_at, so existing rows
-- need to be corrected to match.
UPDATE insights i
SET date = to_char(e.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
FROM episodes e
WHERE e.id = i.episode_id
  AND e.published_at IS NOT NULL
  AND EXTRACT(YEAR FROM e.published_at) >= 2020;
