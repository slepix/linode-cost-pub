/*
  # Fix auth_register parameter order for PostgREST compatibility

  ## Summary
  PostgREST resolves named RPC parameters from a JSON object by matching parameter
  names alphabetically. When calling via JSON body `{p_email, p_fullname, p_password}`,
  PostgREST looks for a function with parameters in alphabetical order:
  (p_email, p_fullname, p_password).

  The previous function was declared as (p_email, p_password, p_fullname) which
  does not match PostgREST's schema cache lookup, causing PGRST202.

  ## Changes
  - Drops the old auth_register(p_email, p_password, p_fullname) signature
  - Recreates auth_register with parameters in alphabetical order: (p_email, p_fullname, p_password)
  - Grants EXECUTE to anon role
*/

DROP FUNCTION IF EXISTS public.auth_register(text, text, text);

CREATE OR REPLACE FUNCTION public.auth_register(
  p_email    text,
  p_fullname text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
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

  v_hash := crypt(p_password, gen_salt('bf', 10));
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

GRANT EXECUTE ON FUNCTION public.auth_register(text, text, text) TO anon;
