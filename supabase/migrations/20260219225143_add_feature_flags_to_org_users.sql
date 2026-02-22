/*
  # Add feature flags to org_users

  ## Summary
  Adds per-user feature access flags to the org_users table, allowing admins to
  control which sections (Cost Management, Compliance) individual users can access,
  independent of their role.

  ## Changes
  - `org_users` table:
    - `can_view_costs` (boolean, default true) — controls access to the Cost Management section
    - `can_view_compliance` (boolean, default true) — controls access to the Compliance/Config section

  ## Notes
  - Defaults to true so existing users retain their current access
  - Admin users always have access to everything regardless of these flags
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_users' AND column_name = 'can_view_costs'
  ) THEN
    ALTER TABLE org_users ADD COLUMN can_view_costs boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_users' AND column_name = 'can_view_compliance'
  ) THEN
    ALTER TABLE org_users ADD COLUMN can_view_compliance boolean NOT NULL DEFAULT true;
  END IF;
END $$;
