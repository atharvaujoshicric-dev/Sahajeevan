// ============================================================================
// SUPABASE CONFIG
// Fill these two values in after you create your Supabase project:
//   Project Settings > API > Project URL
//   Project Settings > API > anon / public key   (NEVER put the service_role key here)
// ============================================================================
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Also set this to the URL you get after deploying the admin-users Edge Function,
// e.g. https://xxxxx.supabase.co/functions/v1/admin-users
const ADMIN_USERS_FUNCTION_URL = "YOUR_SUPABASE_PROJECT_URL/functions/v1/admin-users";

const EMAIL_DOMAIN = "sahjeevan.internal";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}
