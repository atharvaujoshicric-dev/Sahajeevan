// ============================================================================
// SUPABASE CONFIG
// Fill these two values in after you create your Supabase project:
//   Project Settings > API > Project URL
//   Project Settings > API > anon / public key   (this app never needs the
//   service_role key anywhere — all privileged actions are handled by
//   database functions defined in supabase/schema.sql)
// ============================================================================
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
