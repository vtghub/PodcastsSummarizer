-- Migration 014: Allow authenticated users to delete their own view rows (needed for Mark as Unread)
-- Run in Supabase SQL editor: Database → SQL Editor → New query

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'insight_views' AND policyname = 'views_delete_own'
  ) THEN
    CREATE POLICY "views_delete_own" ON insight_views
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END$$;
