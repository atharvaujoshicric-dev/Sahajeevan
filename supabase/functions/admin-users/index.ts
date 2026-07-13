// Supabase Edge Function: admin-users
//
// This is the ONLY place the service role key is ever used. It never touches
// the browser. Deploy it with the Supabase CLI:
//
//   supabase functions deploy admin-users
//
// It must be called by an already-logged-in admin. The function verifies the
// caller's JWT and checks their profile role is 'admin' before doing anything.
//
// Actions (POST body: { action, ...payload }):
//   - list_users            -> { users: [...] }
//   - create_user            { username, password, full_name, role } -> { user }
//   - reset_password          { user_id, new_password } -> { ok: true }
//   - set_active               { user_id, active } -> { ok: true }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Internal fake-email domain: admin gives out a plain "username" and
// password; we store it in Supabase Auth as username@sahjeevan.internal
// so we can keep using normal Supabase email/password auth under the hood.
const EMAIL_DOMAIN = "sahjeevan.internal";

function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Identify the caller from their JWT
    const {
      data: { user: caller },
      error: userErr,
    } = await callerClient.auth.getUser();

    if (userErr || !caller) {
      return json({ error: "Not authenticated" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Confirm caller is an admin
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role, active")
      .eq("id", caller.id)
      .single();

    if (profileErr || !profile || profile.role !== "admin" || !profile.active) {
      return json({ error: "Only an active admin can manage users" }, 403);
    }

    const body = await req.json();
    const action = body.action;

    if (action === "list_users") {
      const { data, error } = await admin
        .from("profiles")
        .select("id, username, full_name, role, active, created_at")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 400);
      return json({ users: data });
    }

    if (action === "create_user") {
      const { username, password, full_name, role } = body;
      if (!username || !password || !role) {
        return json({ error: "username, password and role are required" }, 400);
      }
      if (!["admin", "sales"].includes(role)) {
        return json({ error: "role must be 'admin' or 'sales'" }, 400);
      }
      if (password.length < 6) {
        return json({ error: "Password must be at least 6 characters" }, 400);
      }

      const email = usernameToEmail(username);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) return json({ error: createErr.message }, 400);

      const { error: insertErr } = await admin.from("profiles").insert({
        id: created.user.id,
        username: username.trim(),
        full_name: full_name ?? null,
        role,
        active: true,
      });
      if (insertErr) {
        // roll back the auth user if profile insert failed (e.g. duplicate username)
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: insertErr.message }, 400);
      }

      return json({ user: { id: created.user.id, username, role } });
    }

    if (action === "reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return json({ error: "user_id and new_password are required" }, 400);
      }
      if (new_password.length < 6) {
        return json({ error: "Password must be at least 6 characters" }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        password: new_password,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "set_active") {
      const { user_id, active } = body;
      if (typeof active !== "boolean" || !user_id) {
        return json({ error: "user_id and active are required" }, 400);
      }
      const { error } = await admin.from("profiles").update({ active }).eq("id", user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
