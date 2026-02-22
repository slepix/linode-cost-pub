/*
  # Drop unused private JWT schema objects

  ## Summary
  The custom JWT authentication system (private.jwt_config table and private.sign_jwt function)
  was replaced by native Supabase authentication in migration
  20260222011132_migrate_to_native_supabase_auth.sql.

  This migration removes the leftover private schema objects that are no longer used,
  including the jwt_config table which previously held a sensitive JWT secret value.

  ## Changes
  1. Drops `private.sign_jwt` function
  2. Drops `private.jwt_config` table (including the stored secret value)
  3. Drops `private` schema if it is now empty

  ## Security
  - Removes any stored JWT secret data from the database
  - Eliminates the unused custom signing infrastructure
*/

DROP FUNCTION IF EXISTS private.sign_jwt(jsonb);

DROP TABLE IF EXISTS private.jwt_config;

DROP SCHEMA IF EXISTS private;
