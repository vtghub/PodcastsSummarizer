-- Migration 016: Admin read-all RLS on user_profiles + Realtime publication
-- Enables the Manage Users page to receive push notifications (via Supabase
-- Realtime) when a new user registers, instead of polling.
-- Run in Supabase SQL editor: Database → SQL Editor → New query

-- SECURITY DEFINER function avoids RLS recursion when a policy needs to
-- check the caller's own admin flag (the function bypasses RLS internally,
-- so evaluating it does not re-trigger row-level policies on user_profiles).
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM user_profiles WHERE user_id = auth.uid()),
    FALSE
  );
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles' AND policyname = 'profiles_admin_select_all'
  ) THEN
    CREATE POLICY "profiles_admin_select_all" ON user_profiles
      FOR SELECT USING (is_admin_user());
  END IF;
END$$;

-- Add user_profiles to the Realtime publication so admins' browsers can
-- subscribe to INSERT events (new registrations) client-side.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;
  END IF;
END$$;
