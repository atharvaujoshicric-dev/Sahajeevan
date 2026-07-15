-- PATCH: adds the "Site Head" role + a granular permission system, moves
-- Amount Received / Channel Partner (CP) details to be captured AT BOOKING
-- TIME (asked before "Book This Flat"), and restricts post-booking editing
-- to ONLY the booking date (admin always; Site Head only if granted).
--
-- Safe to run on an existing database. Existing bookings keep whatever
-- amount_received/CP values they already have (NULL/0 if never set).

-- ---- 1. Widen app_users' role + add the permission flag -------------------
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.app_users drop constraint %I;', con.conname);
  end loop;
end $$;

alter table public.app_users add constraint app_users_role_check check (role in ('admin','sales','site_head'));
alter table public.app_users add column if not exists can_edit_booking_date boolean not null default false;

-- ---- 2. Auth functions now also return can_edit_booking_date --------------
drop function if exists public.bootstrap_admin(text, text, text);
create or replace function public.bootstrap_admin(
  p_username text,
  p_password text,
  p_full_name text
) returns table(token uuid, id uuid, username text, full_name text, role text, can_edit_booking_date boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.app_users;
  v_token uuid;
begin
  if exists (select 1 from public.app_users au where au.role = 'admin') then
    raise exception 'An admin account already exists. Please log in instead.';
  end if;
  if p_username is null or length(trim(p_username)) < 3 then
    raise exception 'Username must be at least 3 characters';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  insert into public.app_users(username, password_hash, full_name, role, active)
  values (lower(trim(p_username)), extensions.crypt(p_password, extensions.gen_salt('bf')), p_full_name, 'admin', true)
  returning * into v_user;

  insert into public.app_sessions(user_id) values (v_user.id) returning app_sessions.token into v_token;

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role, v_user.can_edit_booking_date;
end;
$$;

drop function if exists public.login(text, text);
create or replace function public.login(
  p_username text,
  p_password text
) returns table(token uuid, id uuid, username text, full_name text, role text, can_edit_booking_date boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.app_users;
  v_token uuid;
begin
  select * into v_user from public.app_users au
  where au.username = lower(trim(p_username)) and au.active = true;

  if v_user is null or v_user.password_hash <> extensions.crypt(p_password, v_user.password_hash) then
    raise exception 'Invalid ID or password';
  end if;

  insert into public.app_sessions(user_id) values (v_user.id) returning app_sessions.token into v_token;

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role, v_user.can_edit_booking_date;
end;
$$;

drop function if exists public.whoami(uuid);
create or replace function public.whoami(p_token uuid)
returns table(id uuid, username text, full_name text, role text, can_edit_booking_date boolean)
language sql
security definer
set search_path = public
as $$
  select u.id, u.username, u.full_name, u.role, u.can_edit_booking_date
  from public._session_user(p_token) u;
$$;

-- ---- 3. admin_create_user / admin_update_user: site_head + permission -----
drop function if exists public.admin_create_user(uuid, text, text, text, text);
create or replace function public.admin_create_user(
  p_token uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_role text,
  p_can_edit_booking_date boolean
) returns public.app_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller public.app_users;
  v_new public.app_users;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Not authorized';
  end if;
  if p_role not in ('admin','sales','site_head') then
    raise exception 'Role must be admin, sales, or site_head';
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

  insert into public.app_users(username, password_hash, full_name, role, active, can_edit_booking_date)
  values (lower(trim(p_username)), extensions.crypt(p_password, extensions.gen_salt('bf')), p_full_name, p_role, true, coalesce(p_can_edit_booking_date, false))
  returning * into v_new;

  insert into public.audit_log(action, performed_by, details)
  values ('create_user', v_caller.id, jsonb_build_object('created_user', v_new.username, 'role', p_role));

  return v_new;
end;
$$;

drop function if exists public.admin_update_user(uuid, uuid, text, text, boolean);
create or replace function public.admin_update_user(
  p_token uuid,
  p_user_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean,
  p_can_edit_booking_date boolean
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
  if p_role not in ('admin','sales','site_head') then
    raise exception 'Role must be admin, sales, or site_head';
  end if;

  select * into v_target from public.app_users where id = p_user_id;
  if v_target is null then
    raise exception 'User not found';
  end if;

  if v_target.role = 'admin' and (p_role <> 'admin' or p_active = false) then
    if (select count(*) from public.app_users where role = 'admin' and active = true) <= 1 then
      raise exception 'Cannot demote or deactivate the last remaining admin';
    end if;
  end if;

  update public.app_users
    set full_name = p_full_name,
        role = p_role,
        active = p_active,
        can_edit_booking_date = coalesce(p_can_edit_booking_date, false)
    where id = p_user_id
    returning * into v_target;

  insert into public.audit_log(action, performed_by, details)
  values ('update_user', v_caller.id, jsonb_build_object('target_user', v_target.username));

  return v_target;
end;
$$;

-- ---- 4. book_flat: capture amount received + CP details at booking time ---
drop function if exists public.book_flat(uuid, text, text, text, text, numeric, numeric, boolean);
create or replace function public.book_flat(
  p_token uuid,
  p_flat_id text,
  p_buyer_name text,
  p_buyer_phone text,
  p_buyer_email text,
  p_agreement_value numeric,
  p_stamp_duty_rate numeric,
  p_include_cc boolean,
  p_amount_received numeric,
  p_cp_name text,
  p_cp_firm_name text,
  p_cp_number text,
  p_cp_email text
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
  if p_amount_received is not null and p_amount_received < 0 then
    raise exception 'Amount received cannot be negative';
  end if;

  update public.flats
    set status = 'Booked',
        agreement_value = p_agreement_value,
        stamp_duty_rate = p_stamp_duty_rate,
        updated_at = now()
    where id = p_flat_id;

  insert into public.bookings
    (flat_id, buyer_name, buyer_phone, buyer_email, agreement_value, stamp_duty_rate,
     registration, cc_included, cc_amount, booked_by,
     amount_received, cp_name, cp_firm_name, cp_number, cp_email)
  values
    (p_flat_id, p_buyer_name, p_buyer_phone, p_buyer_email, p_agreement_value, p_stamp_duty_rate,
     v_flat.registration, coalesce(p_include_cc,false),
     case when p_include_cc then v_flat.cc_amount else 0 end,
     v_caller.id,
     coalesce(p_amount_received, 0), p_cp_name, p_cp_firm_name, p_cp_number, p_cp_email)
  returning * into v_booking;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (p_flat_id, 'book_flat', v_caller.id, to_jsonb(v_booking));

  return v_booking;
end;
$$;

-- ---- 5. Replace the old broad edit function with a date-only one ----------
drop function if exists public.admin_update_booking_details(uuid, uuid, timestamptz, numeric, text, text, text, text);
drop function if exists public.update_booking_date(uuid, uuid, timestamptz);

create or replace function public.update_booking_date(
  p_token uuid,
  p_booking_id uuid,
  p_booked_at timestamptz
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
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;
  if v_caller.role <> 'admin' and not (v_caller.role = 'site_head' and v_caller.can_edit_booking_date) then
    raise exception 'You do not have permission to edit the booking date';
  end if;
  if p_booked_at is null then
    raise exception 'A booking date is required';
  end if;

  update public.bookings
    set booked_at = p_booked_at
    where id = p_booking_id
    returning * into v_booking;

  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (v_booking.flat_id, 'update_booking_date', v_caller.id,
            jsonb_build_object('booking_id', p_booking_id, 'new_booked_at', p_booked_at));

  return v_booking;
end;
$$;

-- ---- 6. Grants --------------------------------------------------------------
grant execute on function public.bootstrap_admin(text, text, text) to anon;
grant execute on function public.login(text, text) to anon;
grant execute on function public.whoami(uuid) to anon;
grant execute on function public.admin_create_user(uuid, text, text, text, text, boolean) to anon;
grant execute on function public.admin_update_user(uuid, uuid, text, text, boolean, boolean) to anon;
grant execute on function public.book_flat(uuid, text, text, text, text, numeric, numeric, boolean, numeric, text, text, text, text) to anon;
grant execute on function public.update_booking_date(uuid, uuid, timestamptz) to anon;

NOTIFY pgrst, 'reload schema';
