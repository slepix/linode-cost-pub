/*
  # Fix gen_salt Function Reference

  ## Summary
  Updates auth_register function to properly reference pgcrypto functions
  with the extensions schema prefix.

  ## Changes
  1. Updates auth_register to use extensions.gen_salt and extensions.crypt
  2. Updates auth_login to use extensions.crypt

  ## Security
  - Maintains bcrypt password hashing with cost factor 10
  - No changes to security model
*/

CREATE OR REPLACE FUNCTION public.auth_register(
  p_email    text,
  p_fullname text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_id      uuid;
  v_role    text := 'admin';
  v_hash    text;
  v_token   text;
  v_exp     bigint;
  v_payload jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM org_users LIMIT 1) THEN
    RAISE EXCEPTION 'registration_closed';
  END IF;

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF EXISTS (SELECT 1 FROM org_users WHERE email = lower(p_email)) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  v_id   := gen_random_uuid();
  v_exp  := extract(epoch from now() + interval '8 hours')::bigint;

  INSERT INTO org_users (id, email, full_name, role, is_active, password_hash)
  VALUES (v_id, lower(p_email), p_fullname, v_role, true, v_hash);

  v_payload := jsonb_build_object(
    'role',      'authenticated',
    'sub',       v_id::text,
    'email',     lower(p_email),
    'user_role', v_role,
    'iat',       extract(epoch from now())::bigint,
    'exp',       v_exp
  );

  v_token := private.sign_jwt(v_payload);

  RETURN jsonb_build_object(
    'token',     v_token,
    'user_id',   v_id,
    'role',      v_role,
    'full_name', p_fullname,
    'email',     lower(p_email)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_login(
  p_email    text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_row     org_users%ROWTYPE;
  v_token   text;
  v_exp     bigint;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_row FROM org_users WHERE email = lower(p_email) AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  IF v_row.password_hash IS NULL OR v_row.password_hash = '' THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  IF extensions.crypt(p_password, v_row.password_hash) <> v_row.password_hash THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  v_exp := extract(epoch from now() + interval '8 hours')::bigint;

  v_payload := jsonb_build_object(
    'role',      'authenticated',
    'sub',       v_row.id::text,
    'email',     v_row.email,
    'user_role', v_row.role,
    'iat',       extract(epoch from now())::bigint,
    'exp',       v_exp
  );

  v_token := private.sign_jwt(v_payload);

  RETURN jsonb_build_object(
    'token',     v_token,
    'user_id',   v_row.id,
    'role',      v_row.role,
    'full_name', v_row.full_name,
    'email',     v_row.email
  );
END;
$$;
