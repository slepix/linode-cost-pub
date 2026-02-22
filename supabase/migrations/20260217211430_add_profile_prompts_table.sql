/*
  # Add profile prompts table

  ## Summary
  Stores per-savings-profile custom LLM prompts, allowing users to override the
  default system prompt used when generating AI recommendations for each profile
  (relaxed, balanced, aggressive).

  ## New Tables
  - `profile_prompts`
    - `id` (uuid, primary key)
    - `profile` (text, unique) — one of: relaxed | balanced | aggressive
    - `prompt` (text) — the full prompt override; NULL means "use default"
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Anon users can read and upsert (same pattern as ai_config)
*/

CREATE TABLE IF NOT EXISTS profile_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile text UNIQUE NOT NULL,
  prompt text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profile_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select on profile_prompts"
  ON profile_prompts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert on profile_prompts"
  ON profile_prompts FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update on profile_prompts"
  ON profile_prompts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
