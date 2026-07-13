// ============================================================================
// SUPABASE CONFIG
// Fill these two values in after you create your Supabase project:
//   Project Settings > API > Project URL
//   Project Settings > API > anon / public key   (NEVER put the service_role key here)
// ============================================================================
const SUPABASE_URL = "https://utmbsicjlqzayhksvnrq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0bWJzaWNqbHF6YXloa3N2bnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjIzMTgsImV4cCI6MjA5OTQ5ODMxOH0.Obz4XAZMzmb4xVXYo4NWCS2DkepWmqzpqMQ_tzsdt2s";

// Also set this to the URL you get after deploying the admin-users Edge Function,
// e.g. https://xxxxx.supabase.co/functions/v1/admin-users
const ADMIN_USERS_FUNCTION_URL = "https://utmbsicjlqzayhksvnrq.supabase.co/functions/v1/admin-users";

const EMAIL_DOMAIN = "sahjeevan.internal";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}
