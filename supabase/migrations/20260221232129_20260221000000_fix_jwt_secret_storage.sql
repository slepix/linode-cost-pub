/*
  # Fix JWT Secret Storage (superseded)

  ## Summary
  This migration originally created a private schema and JWT secret storage table
  for a custom authentication system. That system has since been replaced by native
  Supabase authentication (see migration 20260222011132_migrate_to_native_supabase_auth.sql).

  The private.jwt_config table and private.sign_jwt function created here are no longer
  used and are dropped by migration 20260222014000_drop_unused_private_jwt_schema.sql.

  ## Changes
  1. Creates `private` schema if not exists
  2. Creates `private.jwt_config` table (later dropped)
  3. Creates `private.sign_jwt` function (later dropped)
*/

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.jwt_config (
  id integer PRIMARY KEY DEFAULT 1,
  secret text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE private.jwt_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to JWT config"
  ON private.jwt_config
  FOR ALL
  TO public
  USING (false);

CREATE OR REPLACE FUNCTION private.sign_jwt(payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  secret        text;
  header_b64    text;
  payload_b64   text;
  signing_input text;
  sig           text;
BEGIN
  SELECT jwt_config.secret INTO secret FROM private.jwt_config WHERE id = 1;

  IF secret IS NULL OR secret = '' THEN
    RAISE EXCEPTION 'JWT secret not configured';
  END IF;

  header_b64  := replace(replace(
    encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'), 'base64'),
    '+', '-'), '/', '_');
  header_b64  := rtrim(header_b64, E'\n=');

  payload_b64 := replace(replace(
    encode(convert_to(payload::text, 'UTF8'), 'base64'),
    '+', '-'), '/', '_');
  payload_b64 := rtrim(payload_b64, E'\n=');

  signing_input := header_b64 || '.' || payload_b64;

  sig := replace(replace(
    encode(hmac(signing_input, secret, 'sha256'), 'base64'),
    '+', '-'), '/', '_');
  sig := rtrim(sig, E'\n=');

  RETURN signing_input || '.' || sig;
END;
$$;
