
/*
  # Fix linode_types_cache RLS policies to allow anon access

  ## Problem
  The existing policies only allow `authenticated` role, but the app uses the
  anon key without an auth session. This blocks INSERT and DELETE from the browser.

  ## Changes
  - Drop existing role-restricted policies
  - Recreate all policies to also allow the `anon` role
  - This table is a public price cache with no sensitive data
*/

DROP POLICY IF EXISTS "Anyone can read linode types cache" ON linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can insert linode types cache" ON linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can update linode types cache" ON linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can delete linode types cache" ON linode_types_cache;

CREATE POLICY "Anyone can read linode types cache"
  ON linode_types_cache FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert linode types cache"
  ON linode_types_cache FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update linode types cache"
  ON linode_types_cache FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete linode types cache"
  ON linode_types_cache FOR DELETE
  TO anon, authenticated
  USING (true);
