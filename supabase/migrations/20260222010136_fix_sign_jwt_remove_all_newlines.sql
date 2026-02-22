/*
  # Fix sign_jwt to remove ALL newlines from base64 output

  ## Summary
  PostgreSQL's encode(..., 'base64') wraps output at 76 characters with newline
  characters. The previous implementation only stripped TRAILING newlines using
  rtrim(), leaving embedded newlines in the middle of longer base64 strings.
  These embedded newlines cause "Failed to construct 'Headers': Invalid value"
  errors in the browser when the JWT is used as a Bearer token.

  ## Changes
  1. Updates private.sign_jwt to use replace(..., E'\n', '') to strip ALL
     newlines from each base64 segment before building the JWT string.
*/

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

  header_b64 := replace(replace(replace(
    encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'), 'base64'),
    E'\n', ''), '+', '-'), '/', '_');
  header_b64 := rtrim(header_b64, '=');

  payload_b64 := replace(replace(replace(
    encode(convert_to(payload::text, 'UTF8'), 'base64'),
    E'\n', ''), '+', '-'), '/', '_');
  payload_b64 := rtrim(payload_b64, '=');

  signing_input := header_b64 || '.' || payload_b64;

  sig := replace(replace(replace(
    encode(hmac(signing_input::bytea, secret::bytea, 'sha256'), 'base64'),
    E'\n', ''), '+', '-'), '/', '_');
  sig := rtrim(sig, '=');

  RETURN signing_input || '.' || sig;
END;
$$;
