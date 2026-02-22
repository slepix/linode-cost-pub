/*
  # Drop duplicate SELECT policy on linode_types_cache

  The "Authenticated users can select linode_types_cache" policy is a duplicate
  of "Authenticated users can read linode_types_cache". Drop the older one.
*/

DROP POLICY IF EXISTS "Authenticated users can select linode_types_cache" ON public.linode_types_cache;
