-- ============================================================================
-- SAHJEEVAN INVENTORY SYSTEM — DATABASE SCHEMA (no Supabase Auth, no Edge Functions)
-- Run this entire file once in Supabase SQL Editor (Project > SQL Editor > New query)
--
-- Everything (logins, sessions, password resets) is handled by this app's own
-- tables + functions using pgcrypto for password hashing — no service_role
-- key or Edge Function is needed anywhere.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. APP_USERS  (every login: the one Super Admin + every sales login)
-- ----------------------------------------------------------------------------
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  full_name text,
  role text not null check (role in ('admin','sales')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. APP_SESSIONS  (a session token is issued on login, stored in the
--    browser's localStorage, and sent back as a parameter on every RPC call
--    that needs to know who's calling)
-- ----------------------------------------------------------------------------
create table if not exists public.app_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

-- ----------------------------------------------------------------------------
-- 3. FLATS  (imported from the live inventory excel sheet)
-- ----------------------------------------------------------------------------
create table if not exists public.flats (
  id text primary key,                       -- e.g. 'A-101'
  tower text not null,
  unit_no text not null,
  floor_number int not null,
  series int,
  configuration_type text not null,
  carpet_area numeric not null,
  saleable_area numeric not null,
  status text not null default 'Available' check (status in ('Available','Booked','Blocked')),
  ownership text,                             -- Landowner / Developer
  sanction_status text,
  ownership_detail text,                      -- WPC LLP / DEVKAR / J & G NIMHAN
  floor_band text,
  facing text,
  floor_band_charges numeric default 0,
  facing_premium numeric default 0,
  base_apr numeric,

  -- Pricing engine -----------------------------------------------------------
  agreement_value numeric not null,           -- editable by sales/admin
  stamp_duty_rate numeric not null default 0.07 check (stamp_duty_rate in (0.06,0.07)),
  registration numeric not null default 30000,

  stamp_duty numeric generated always as (round(agreement_value * stamp_duty_rate)) stored,
  gst numeric generated always as (round(agreement_value * 0.05)) stored,
  package_total numeric generated always as (
    round(agreement_value + (agreement_value * stamp_duty_rate) + registration + (agreement_value * 0.05))
  ) stored,

  -- Cash component (admin-controlled, per flat) -------------------------------
  cc_enabled boolean not null default false,
  cc_amount numeric not null default 0,

  -- Only WPC LLP flats are bookable for now (all flats are still visible)
  is_selectable boolean generated always as (ownership_detail = 'WPC LLP') stored,

  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. BOOKINGS
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  flat_id text not null references public.flats(id),
  buyer_name text not null,
  buyer_phone text,
  buyer_email text,

  agreement_value numeric not null,
  stamp_duty_rate numeric not null check (stamp_duty_rate in (0.06,0.07)),
  registration numeric not null default 30000,
  stamp_duty numeric generated always as (round(agreement_value * stamp_duty_rate)) stored,
  gst numeric generated always as (round(agreement_value * 0.05)) stored,
  package_total numeric generated always as (
    round(agreement_value + (agreement_value * stamp_duty_rate) + registration + (agreement_value * 0.05))
  ) stored,

  cc_included boolean not null default false,
  cc_amount numeric not null default 0,

  status text not null default 'Active' check (status in ('Active','Cancelled')),
  booked_by uuid references public.app_users(id),
  booked_at timestamptz not null default now(),

  cancelled_by uuid references public.app_users(id),
  cancelled_at timestamptz,
  cancellation_reason text
);

-- ----------------------------------------------------------------------------
-- 5. AUDIT LOG
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  flat_id text,
  action text not null,
  performed_by uuid references public.app_users(id),
  details jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 6. LOCK DOWN DIRECT TABLE ACCESS
--    The anon key is the only key this app ever uses (there's no Supabase Auth
--    login, so every request comes in as the 'anon' role). We revoke all
--    direct table privileges from it, so the only way in or out is through the
--    SECURITY DEFINER functions below, each of which enforces its own rules.
-- ============================================================================
revoke all on public.app_users    from anon, authenticated;
revoke all on public.app_sessions from anon, authenticated;
revoke all on public.flats        from anon, authenticated;
revoke all on public.bookings     from anon, authenticated;
revoke all on public.audit_log    from anon, authenticated;

alter table public.app_users    enable row level security;
alter table public.app_sessions enable row level security;
alter table public.flats        enable row level security;
alter table public.bookings     enable row level security;
alter table public.audit_log    enable row level security;
-- (no policies are created — with RLS on and zero policies, and privileges
--  revoked, these tables are completely inaccessible except to the functions
--  below, which run as the table owner and therefore bypass RLS.)

-- ============================================================================
-- 7. SESSION HELPER — resolves a token to the calling user, or NULL
-- ============================================================================
create or replace function public._session_user(p_token uuid)
returns public.app_users
language sql
security definer
set search_path = public
as $$
  select u.*
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and u.active = true
  limit 1;
$$;

-- ============================================================================
-- 8. AUTH FUNCTIONS
-- ============================================================================

-- Is an admin account already set up? (used by the frontend to decide whether
-- to show "create the first admin account" or the normal login form)
create or replace function public.admin_exists()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_users where role = 'admin');
$$;

-- One-time bootstrap: creates the very first Super Admin account.
-- Refuses to run again once any admin exists.
create or replace function public.bootstrap_admin(
  p_username text,
  p_password text,
  p_full_name text
) returns table(token uuid, id uuid, username text, full_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_token uuid;
begin
  if exists (select 1 from public.app_users where role = 'admin') then
    raise exception 'An admin account already exists. Please log in instead.';
  end if;
  if p_username is null or length(trim(p_username)) < 3 then
    raise exception 'Username must be at least 3 characters';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  insert into public.app_users(username, password_hash, full_name, role, active)
  values (lower(trim(p_username)), crypt(p_password, gen_salt('bf')), p_full_name, 'admin', true)
  returning * into v_user;

  insert into public.app_sessions(user_id) values (v_user.id) returning app_sessions.token into v_token;

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role;
end;
$$;

-- Normal login for everyone (admin included, after the first admin exists).
create or replace function public.login(
  p_username text,
  p_password text
) returns table(token uuid, id uuid, username text, full_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_token uuid;
begin
  select * into v_user from public.app_users
  where username = lower(trim(p_username)) and active = true;

  if v_user is null or v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    raise exception 'Invalid ID or password';
  end if;

  insert into public.app_sessions(user_id) values (v_user.id) returning app_sessions.token into v_token;

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role;
end;
$$;

-- Restore a session on page reload.
create or replace function public.whoami(p_token uuid)
returns table(id uuid, username text, full_name text, role text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.username, u.full_name, u.role
  from public._session_user(p_token) u;
$$;

create or replace function public.logout(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.app_sessions where token = p_token;
$$;

-- ============================================================================
-- 9. ADMIN: USER MANAGEMENT (create / update / reset password / delete)
-- ============================================================================

create or replace function public.admin_list_users(p_token uuid)
returns setof public.app_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Not authorized';
  end if;
  return query select * from public.app_users order by created_at desc;
end;
$$;

create or replace function public.admin_create_user(
  p_token uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_role text
) returns public.app_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
  v_new public.app_users;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Not authorized';
  end if;
  if p_role not in ('admin','sales') then
    raise exception 'Role must be admin or sales';
  end if;
  if p_username is null or length(trim(p_username)) < 3 then
    raise exception 'Username must be at least 3 characters';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from public.app_users where username = lower(trim(p_username))) then
    raise exception 'That username is already taken';
  end if;

  insert into public.app_users(username, password_hash, full_name, role, active)
  values (lower(trim(p_username)), crypt(p_password, gen_salt('bf')), p_full_name, p_role, true)
  returning * into v_new;

  insert into public.audit_log(action, performed_by, details)
  values ('create_user', v_caller.id, jsonb_build_object('created_user', v_new.username, 'role', p_role));

  return v_new;
end;
$$;

-- Update a user's name / role / active flag (NOT password — use admin_reset_password for that).
create or replace function public.admin_update_user(
  p_token uuid,
  p_user_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean
) returns public.app_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
  v_target public.app_users;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Not authorized';
  end if;
  if p_role not in ('admin','sales') then
    raise exception 'Role must be admin or sales';
  end if;

  select * into v_target from public.app_users where id = p_user_id;
  if v_target is null then
    raise exception 'User not found';
  end if;

  -- Don't allow demoting/deactivating the last remaining admin
  if v_target.role = 'admin' and (p_role <> 'admin' or p_active = false) then
    if (select count(*) from public.app_users where role = 'admin' and active = true) <= 1 then
      raise exception 'Cannot demote or deactivate the last remaining admin';
    end if;
  end if;

  update public.app_users
    set full_name = p_full_name, role = p_role, active = p_active
    where id = p_user_id
    returning * into v_target;

  insert into public.audit_log(action, performed_by, details)
  values ('update_user', v_caller.id, jsonb_build_object('target_user', v_target.username));

  return v_target;
end;
$$;

create or replace function public.admin_reset_password(
  p_token uuid,
  p_user_id uuid,
  p_new_password text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Not authorized';
  end if;
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if not exists (select 1 from public.app_users where id = p_user_id) then
    raise exception 'User not found';
  end if;

  update public.app_users
    set password_hash = crypt(p_new_password, gen_salt('bf'))
    where id = p_user_id;

  delete from public.app_sessions where user_id = p_user_id;

  insert into public.audit_log(action, performed_by, details)
  values ('reset_password', v_caller.id, jsonb_build_object('target_user_id', p_user_id));
end;
$$;

create or replace function public.admin_delete_user(
  p_token uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
  v_target public.app_users;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Not authorized';
  end if;
  if p_user_id = v_caller.id then
    raise exception 'You cannot delete your own account while logged in as it';
  end if;

  select * into v_target from public.app_users where id = p_user_id;
  if v_target is null then
    raise exception 'User not found';
  end if;

  if v_target.role = 'admin' and (select count(*) from public.app_users where role = 'admin') <= 1 then
    raise exception 'Cannot delete the last remaining admin';
  end if;

  delete from public.app_users where id = p_user_id;

  insert into public.audit_log(action, performed_by, details)
  values ('delete_user', v_caller.id, jsonb_build_object('deleted_username', v_target.username));
end;
$$;

-- ============================================================================
-- 10. FLATS & BOOKINGS — READ ACCESS (any logged-in user, admin or sales)
-- ============================================================================

create or replace function public.get_flats(p_token uuid)
returns setof public.flats
language plpgsql
security definer
set search_path = public
as $$
begin
  if public._session_user(p_token) is null then
    raise exception 'Not authenticated';
  end if;
  return query select * from public.flats order by tower, floor_number, series;
end;
$$;

create or replace function public.get_bookings(p_token uuid)
returns table (
  id uuid, flat_id text, buyer_name text, buyer_phone text, buyer_email text,
  agreement_value numeric, stamp_duty_rate numeric, registration numeric,
  stamp_duty numeric, gst numeric, package_total numeric,
  cc_included boolean, cc_amount numeric, status text,
  booked_by uuid, booked_at timestamptz,
  cancelled_by uuid, cancelled_at timestamptz, cancellation_reason text,
  tower text, unit_no text, configuration_type text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public._session_user(p_token) is null then
    raise exception 'Not authenticated';
  end if;
  return query
    select b.id, b.flat_id, b.buyer_name, b.buyer_phone, b.buyer_email,
           b.agreement_value, b.stamp_duty_rate, b.registration,
           b.stamp_duty, b.gst, b.package_total,
           b.cc_included, b.cc_amount, b.status,
           b.booked_by, b.booked_at,
           b.cancelled_by, b.cancelled_at, b.cancellation_reason,
           f.tower, f.unit_no, f.configuration_type
    from public.bookings b
    join public.flats f on f.id = b.flat_id
    order by b.booked_at desc;
end;
$$;

create or replace function public.get_booking_for_flat(p_token uuid, p_flat_id text)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if public._session_user(p_token) is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_booking from public.bookings
    where flat_id = p_flat_id and status = 'Active'
    order by booked_at desc limit 1;
  return v_booking;
end;
$$;

-- ============================================================================
-- 11. FLATS & BOOKINGS — WRITES (business rules enforced here)
-- ============================================================================

create or replace function public.update_flat_pricing(
  p_token uuid,
  p_flat_id text,
  p_agreement_value numeric,
  p_stamp_duty_rate numeric
) returns public.flats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
  v_flat public.flats;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_flat from public.flats where id = p_flat_id for update;
  if v_flat is null then
    raise exception 'Flat not found';
  end if;
  if v_flat.status <> 'Available' then
    raise exception 'Flat is not available';
  end if;
  if not v_flat.is_selectable then
    raise exception 'This flat is not currently bookable';
  end if;
  if p_stamp_duty_rate not in (0.06,0.07) then
    raise exception 'Stamp duty rate must be 0.06 or 0.07';
  end if;
  if p_agreement_value is null or p_agreement_value <= 0 then
    raise exception 'Invalid agreement value';
  end if;

  update public.flats
    set agreement_value = p_agreement_value,
        stamp_duty_rate = p_stamp_duty_rate,
        updated_at = now()
    where id = p_flat_id
    returning * into v_flat;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (p_flat_id, 'update_pricing', v_caller.id,
            jsonb_build_object('agreement_value', p_agreement_value, 'stamp_duty_rate', p_stamp_duty_rate));

  return v_flat;
end;
$$;

create or replace function public.set_flat_cc(
  p_token uuid,
  p_flat_id text,
  p_enabled boolean,
  p_amount numeric
) returns public.flats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
  v_flat public.flats;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Only admin can set the cash component';
  end if;

  update public.flats
    set cc_enabled = p_enabled,
        cc_amount = coalesce(p_amount, 0),
        updated_at = now()
    where id = p_flat_id
    returning * into v_flat;

  if v_flat is null then
    raise exception 'Flat not found';
  end if;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (p_flat_id, 'set_cc', v_caller.id,
            jsonb_build_object('enabled', p_enabled, 'amount', p_amount));

  return v_flat;
end;
$$;

create or replace function public.book_flat(
  p_token uuid,
  p_flat_id text,
  p_buyer_name text,
  p_buyer_phone text,
  p_buyer_email text,
  p_agreement_value numeric,
  p_stamp_duty_rate numeric,
  p_include_cc boolean
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
  v_flat public.flats;
  v_booking public.bookings;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_flat from public.flats where id = p_flat_id for update;
  if v_flat is null then
    raise exception 'Flat not found';
  end if;
  if v_flat.status <> 'Available' then
    raise exception 'Flat is not available';
  end if;
  if not v_flat.is_selectable then
    raise exception 'This flat is not currently bookable';
  end if;
  if p_stamp_duty_rate not in (0.06,0.07) then
    raise exception 'Stamp duty rate must be 0.06 or 0.07';
  end if;
  if p_agreement_value is null or p_agreement_value <= 0 then
    raise exception 'Invalid agreement value';
  end if;
  if p_include_cc and not v_flat.cc_enabled then
    raise exception 'Cash component is not enabled for this flat';
  end if;

  update public.flats
    set status = 'Booked',
        agreement_value = p_agreement_value,
        stamp_duty_rate = p_stamp_duty_rate,
        updated_at = now()
    where id = p_flat_id;

  insert into public.bookings
    (flat_id, buyer_name, buyer_phone, buyer_email, agreement_value, stamp_duty_rate,
     registration, cc_included, cc_amount, booked_by)
  values
    (p_flat_id, p_buyer_name, p_buyer_phone, p_buyer_email, p_agreement_value, p_stamp_duty_rate,
     v_flat.registration, coalesce(p_include_cc,false),
     case when p_include_cc then v_flat.cc_amount else 0 end,
     v_caller.id)
  returning * into v_booking;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (p_flat_id, 'book_flat', v_caller.id, to_jsonb(v_booking));

  return v_booking;
end;
$$;

create or replace function public.cancel_booking(
  p_token uuid,
  p_booking_id uuid,
  p_reason text
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.app_users;
  v_booking public.bookings;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Only admin can cancel a booking';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.status = 'Cancelled' then
    raise exception 'Booking already cancelled';
  end if;

  update public.bookings
    set status = 'Cancelled',
        cancelled_by = v_caller.id,
        cancelled_at = now(),
        cancellation_reason = p_reason
    where id = p_booking_id
    returning * into v_booking;

  update public.flats
    set status = 'Available', updated_at = now()
    where id = v_booking.flat_id;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (v_booking.flat_id, 'cancel_booking', v_caller.id,
            jsonb_build_object('booking_id', p_booking_id, 'reason', p_reason));

  return v_booking;
end;
$$;

-- ============================================================================
-- 12. GRANTS — the anon role may only ever call these functions, never touch
--     the tables directly.
-- ============================================================================
grant execute on function public.admin_exists() to anon;
grant execute on function public.bootstrap_admin(text, text, text) to anon;
grant execute on function public.login(text, text) to anon;
grant execute on function public.whoami(uuid) to anon;
grant execute on function public.logout(uuid) to anon;
grant execute on function public.admin_list_users(uuid) to anon;
grant execute on function public.admin_create_user(uuid, text, text, text, text) to anon;
grant execute on function public.admin_update_user(uuid, uuid, text, text, boolean) to anon;
grant execute on function public.admin_reset_password(uuid, uuid, text) to anon;
grant execute on function public.admin_delete_user(uuid, uuid) to anon;
grant execute on function public.get_flats(uuid) to anon;
grant execute on function public.get_bookings(uuid) to anon;
grant execute on function public.get_booking_for_flat(uuid, text) to anon;
grant execute on function public.update_flat_pricing(uuid, text, numeric, numeric) to anon;
grant execute on function public.set_flat_cc(uuid, text, boolean, numeric) to anon;
grant execute on function public.book_flat(uuid, text, text, text, text, numeric, numeric, boolean) to anon;
grant execute on function public.cancel_booking(uuid, uuid, text) to anon;

-- ============================================================================
-- Done. Next: run seed_data.sql, then open the app. Since no admin exists
-- yet, it will show "Create Admin Account" first. After that, log in as
-- admin and create sales logins from the Users tab.
-- ============================================================================
