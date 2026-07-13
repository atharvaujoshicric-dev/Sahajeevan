-- ============================================================================
-- SAHJEEVAN INVENTORY SYSTEM — DATABASE SCHEMA
-- Run this entire file once in Supabase SQL Editor (Project > SQL Editor > New query)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES  (extends Supabase auth.users with a role + human-friendly username)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  role text not null check (role in ('admin','sales')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- helper: is the currently logged in user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- helper: is the currently logged in user an active sales or admin user?
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

create policy "profiles: user can read own row" on public.profiles
  for select using (id = auth.uid());

create policy "profiles: admin can read all rows" on public.profiles
  for select using (public.is_admin());

-- No insert/update/delete policies are granted to normal clients.
-- All user creation / password resets / deactivation happen through the
-- admin-users Edge Function using the service role key (see /supabase/functions).

-- ----------------------------------------------------------------------------
-- 2. FLATS  (imported from the live inventory excel sheet)
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

alter table public.flats enable row level security;

create policy "flats: any active user can read all flats" on public.flats
  for select using (public.is_active_user());

-- No direct insert/update/delete from clients — all writes go through the
-- RPC functions below so business rules (WPC-LLP-only, status checks,
-- role checks) are always enforced server-side.

-- ----------------------------------------------------------------------------
-- 3. BOOKINGS
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
  booked_by uuid references public.profiles(id),
  booked_at timestamptz not null default now(),

  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancellation_reason text
);

alter table public.bookings enable row level security;

create policy "bookings: any active user can read all bookings" on public.bookings
  for select using (public.is_active_user());

-- ----------------------------------------------------------------------------
-- 4. AUDIT LOG  (for the admin analytics / activity trail)
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  flat_id text,
  action text not null,
  performed_by uuid references public.profiles(id),
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit_log: admin can read" on public.audit_log
  for select using (public.is_admin());

-- ============================================================================
-- 5. RPC FUNCTIONS — every write to flats/bookings goes through one of these.
--    They run as SECURITY DEFINER so they can bypass the (deliberately empty)
--    write policies above, but each one enforces its own permission checks.
-- ============================================================================

-- 5a. Update the negotiable pricing fields on a flat before it's booked.
create or replace function public.update_flat_pricing(
  p_flat_id text,
  p_agreement_value numeric,
  p_stamp_duty_rate numeric
) returns public.flats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flat public.flats;
begin
  if not public.is_active_user() then
    raise exception 'Not authorized';
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
    values (p_flat_id, 'update_pricing', auth.uid(),
            jsonb_build_object('agreement_value', p_agreement_value, 'stamp_duty_rate', p_stamp_duty_rate));

  return v_flat;
end;
$$;

-- 5b. Admin-only: toggle / set the Cash Component for a specific flat.
create or replace function public.set_flat_cc(
  p_flat_id text,
  p_enabled boolean,
  p_amount numeric
) returns public.flats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flat public.flats;
begin
  if not public.is_admin() then
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
    values (p_flat_id, 'set_cc', auth.uid(),
            jsonb_build_object('enabled', p_enabled, 'amount', p_amount));

  return v_flat;
end;
$$;

-- 5c. Book a flat (sales or admin).
create or replace function public.book_flat(
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
  v_flat public.flats;
  v_booking public.bookings;
begin
  if not public.is_active_user() then
    raise exception 'Not authorized';
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
     auth.uid())
  returning * into v_booking;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (p_flat_id, 'book_flat', auth.uid(), to_jsonb(v_booking));

  return v_booking;
end;
$$;

-- 5d. Admin-only: cancel a booking, flat goes back to Available.
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if not public.is_admin() then
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
        cancelled_by = auth.uid(),
        cancelled_at = now(),
        cancellation_reason = p_reason
    where id = p_booking_id
    returning * into v_booking;

  update public.flats
    set status = 'Available', updated_at = now()
    where id = v_booking.flat_id;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (v_booking.flat_id, 'cancel_booking', auth.uid(),
            jsonb_build_object('booking_id', p_booking_id, 'reason', p_reason));

  return v_booking;
end;
$$;

-- ============================================================================
-- Done. Next: run seed_data.sql, then deploy the admin-users Edge Function,
-- then create your first admin profile row manually (see README.md).
-- ============================================================================
