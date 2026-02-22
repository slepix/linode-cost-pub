/*
  # Add per-account feature flags to user_account_access

  ## Summary
  Moves feature access flags from the global org_users table to the
  user_account_access join table, allowing admins to grant different
  feature permissions per account per user.

  ## Changes
  - `user_account_access` table:
    - `can_view_costs` (boolean, default true) — whether user can view cost management for this account
    - `can_view_compliance` (boolean, default true) — whether user can view compliance/config for this account

  ## Notes
  - Defaults to true so existing grants retain full access
  - Admin users always see everything regardless of these flags
  - The global flags on org_users are superseded by these per-account flags
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_account_access' AND column_name = 'can_view_costs'
  ) THEN
    ALTER TABLE user_account_access ADD COLUMN can_view_costs boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_account_access' AND column_name = 'can_view_compliance'
  ) THEN
    ALTER TABLE user_account_access ADD COLUMN can_view_compliance boolean NOT NULL DEFAULT true;
  END IF;
END $$;
