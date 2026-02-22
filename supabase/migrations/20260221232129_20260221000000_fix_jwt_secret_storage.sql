/*
  # Fix JWT Secret Storage

  ## Summary
  Creates private schema and JWT secret storage table since database-level
  configuration parameters cannot be set without elevated privileges.

  ## Changes
  1. Creates `private` schema if not exists
  2. Creates `private.jwt_config` table to store the JWT secret
  3. Inserts a default JWT secret
  4. Updates `private.sign_jwt` function to read from the table instead of GUC
  5. Enables RLS on the config table (deny all access from outside functions)

  ## Security
  - JWT secret is stored in private schema
  - RLS blocks all direct access to the secret
  - Only accessible via SECURITY DEFINER functions
  - Secret never exposed to clients
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

INSERT INTO private.jwt_config (id, secret)
VALUES (1, 'NQHQKyd05G/IGvsqKId/QUrwv4hFen7Khv3spUd52GM=')
ON CONFLICT (id) DO NOTHING;

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
