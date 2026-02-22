import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error('SUPABASE_URL or VITE_SUPABASE_URL is required');

const key = supabaseServiceKey || supabaseAnonKey;
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required');

export const supabase = createClient(supabaseUrl, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
