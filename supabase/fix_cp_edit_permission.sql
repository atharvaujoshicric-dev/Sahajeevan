-- PATCH: adds a second granular permission (can_edit_cp_details) so admin
-- can edit a booking's Channel Partner details after the fact, and can grant
-- that same ability to a Site Head — independently of the booking-date
-- permission. Safe to run on an existing database.

-- ---- 1. New permission column ----------------------------------------------
alter table public.app_users add column if not exists can_edit_cp_details boolean not null default false;

-- ---- 2. Auth functions now also return can_edit_cp_details -----------------
drop function if exists public.bootstrap_admin(text, text, text);
create or replace function public.bootstrap_admin(
  p_username text,
  p_password text,
  p_full_name text
) returns table(token uuid, id uuid, username text, full_name text, role text, can_edit_booking_date boolean, can_edit_cp_details boolean)
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

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role, v_user.can_edit_booking_date, v_user.can_edit_cp_details;
end;
$$;

drop function if exists public.login(text, text);
create or replace function public.login(
  p_username text,
  p_password text
) returns table(token uuid, id uuid, username text, full_name text, role text, can_edit_booking_date boolean, can_edit_cp_details boolean)
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

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role, v_user.can_edit_booking_date, v_user.can_edit_cp_details;
end;
$$;

drop function if exists public.whoami(uuid);
create or replace function public.whoami(p_token uuid)
returns table(id uuid, username text, full_name text, role text, can_edit_booking_date boolean, can_edit_cp_details boolean)
language sql
security definer
set search_path = public
as $$
  select u.id, u.username, u.full_name, u.role, u.can_edit_booking_date, u.can_edit_cp_details
  from public._session_user(p_token) u;
$$;

-- ---- 3. admin_create_user / admin_update_user: new permission param -------
drop function if exists public.admin_create_user(uuid, text, text, text, text, boolean);
create or replace function public.admin_create_user(
  p_token uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_role text,
  p_can_edit_booking_date boolean,
  p_can_edit_cp_details boolean
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

  insert into public.app_users(username, password_hash, full_name, role, active, can_edit_booking_date, can_edit_cp_details)
  values (lower(trim(p_username)), extensions.crypt(p_password, extensions.gen_salt('bf')), p_full_name, p_role, true,
          coalesce(p_can_edit_booking_date, false), coalesce(p_can_edit_cp_details, false))
  returning * into v_new;

  insert into public.audit_log(action, performed_by, details)
  values ('create_user', v_caller.id, jsonb_build_object('created_user', v_new.username, 'role', p_role));

  return v_new;
end;
$$;

drop function if exists public.admin_update_user(uuid, uuid, text, text, boolean, boolean);
create or replace function public.admin_update_user(
  p_token uuid,
  p_user_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean,
  p_can_edit_booking_date boolean,
  p_can_edit_cp_details boolean
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
        can_edit_booking_date = coalesce(p_can_edit_booking_date, false),
        can_edit_cp_details = coalesce(p_can_edit_cp_details, false)
    where id = p_user_id
    returning * into v_target;

  insert into public.audit_log(action, performed_by, details)
  values ('update_user', v_caller.id, jsonb_build_object('target_user', v_target.username));

  return v_target;
end;
$$;

-- ---- 4. New function: edit ONLY a booking's CP details ---------------------
create or replace function public.update_booking_cp_details(
  p_token uuid,
  p_booking_id uuid,
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
  v_booking public.bookings;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;
  if v_caller.role <> 'admin' and not (v_caller.role = 'site_head' and v_caller.can_edit_cp_details) then
    raise exception 'You do not have permission to edit Channel Partner details';
  end if;

  update public.bookings
    set cp_name = p_cp_name,
        cp_firm_name = p_cp_firm_name,
        cp_number = p_cp_number,
        cp_email = p_cp_email
    where id = p_booking_id
    returning * into v_booking;

  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (v_booking.flat_id, 'update_booking_cp_details', v_caller.id,
            jsonb_build_object('booking_id', p_booking_id));

  return v_booking;
end;
$$;

-- ---- 5. Grants --------------------------------------------------------------
grant execute on function public.bootstrap_admin(text, text, text) to anon;
grant execute on function public.login(text, text) to anon;
grant execute on function public.whoami(uuid) to anon;
grant execute on function public.admin_create_user(uuid, text, text, text, text, boolean, boolean) to anon;
grant execute on function public.admin_update_user(uuid, uuid, text, text, boolean, boolean, boolean) to anon;
grant execute on function public.update_booking_cp_details(uuid, uuid, text, text, text, text) to anon;

NOTIFY pgrst, 'reload schema';
