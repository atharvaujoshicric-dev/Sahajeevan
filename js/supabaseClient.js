// ============================================================================
// SUPABASE CONFIG
// Fill these two values in after you create your Supabase project:
//   Project Settings > API > Project URL
//   Project Settings > API > anon / public key   (this app never needs the
//   service_role key anywhere — all privileged actions are handled by
//   database functions defined in supabase/schema.sql)
// ============================================================================
const SUPABASE_URL = "https://utmbsicjlqzayhksvnrq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0bWJzaWNqbHF6YXloa3N2bnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjIzMTgsImV4cCI6MjA5OTQ5ODMxOH0.Obz4XAZMzmb4xVXYo4NWCS2DkepWmqzpqMQ_tzsdt2s";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
