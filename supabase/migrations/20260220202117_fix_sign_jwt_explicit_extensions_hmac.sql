/*
  # Fix private.sign_jwt to call extensions.hmac explicitly

  The hmac() function lives in the extensions schema. Even though extensions
  is in the search_path, the SECURITY DEFINER context can resolve it
  inconsistently. This fix calls extensions.hmac() with the full schema prefix
  to guarantee resolution.
*/

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
  secret := current_setting('app.settings.jwt_secret', true);
  IF secret IS NULL OR secret = '' THEN
    RAISE EXCEPTION 'JWT secret not configured. Run: ALTER DATABASE yourdb SET app.settings.jwt_secret = ''your-secret'';';
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
