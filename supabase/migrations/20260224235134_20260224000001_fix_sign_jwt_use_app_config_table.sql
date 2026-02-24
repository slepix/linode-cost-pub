/*
  # Fix sign_jwt to read secret from private.app_config table

  ## Problem
  The previous implementation used `current_setting('app.settings.jwt_secret')` which
  requires `ALTER DATABASE ... SET` — a superuser operation not available on Linode
  Managed Databases.

  ## Changes
  1. Creates `private` schema if it does not exist
  2. Creates `private.app_config` table to store key/value configuration
  3. Updates `private.sign_jwt` to read the JWT secret from the table instead of
     a GUC (database configuration parameter)

  ## Migration Notes
  - The deploy script now uses INSERT into private.app_config instead of ALTER DATABASE SET
  - Existing deployments can migrate by running:
      INSERT INTO private.app_config (key, value) VALUES ('jwt_secret', 'your-secret')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
*/

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE OR REPLACE FUNCTION private.sign_jwt(payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $$
DECLARE
  secret        text;
  header_b64    text;
  payload_b64   text;
  signing_input text;
  sig           text;
BEGIN
  SELECT value INTO secret FROM private.app_config WHERE key = 'jwt_secret';
  IF secret IS NULL OR secret = '' THEN
    RAISE EXCEPTION 'JWT secret not configured. Insert a row into private.app_config with key=jwt_secret.';
  END IF;

  header_b64 := replace(replace(
    encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'), 'base64'),
    '+', '-'), '/', '_');
  header_b64 := rtrim(header_b64, E'\n=');

  payload_b64 := replace(replace(
    encode(convert_to(payload::text, 'UTF8'), 'base64'),
    '+', '-'), '/', '_');
  payload_b64 := rtrim(payload_b64, E'\n=');

  signing_input := header_b64 || '.' || payload_b64;

  sig := replace(replace(
    encode(extensions.hmac(signing_input, secret, 'sha256'), 'base64'),
    '+', '-'), '/', '_');
  sig := rtrim(sig, E'\n=');

  RETURN signing_input || '.' || sig;
END;
$$;
