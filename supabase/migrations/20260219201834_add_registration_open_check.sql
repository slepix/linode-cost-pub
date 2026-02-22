/*
  # Add registration_open check function

  ## Summary
  Adds a public (anon-accessible) function that returns true when no org_users
  exist yet. The login page calls this to decide whether to show the Register
  tab. Once the first admin registers the tab is hidden and new users can only
  be created by admins through the management panel.

  ## New Functions
  - `public.registration_open()` — returns boolean, accessible to anon role
*/

CREATE OR REPLACE FUNCTION public.registration_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM org_users LIMIT 1);
$$;

GRANT EXECUTE ON FUNCTION public.registration_open() TO anon, authenticated;
