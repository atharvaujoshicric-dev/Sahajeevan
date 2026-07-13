-- PATCH: fixes "column reference is ambiguous" on bootstrap_admin / login.
-- Safe to run anytime — just replaces the two functions.

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
  values (lower(trim(p_username)), crypt(p_password, gen_salt('bf')), p_full_name, 'admin', true)
  returning * into v_user;

  insert into public.app_sessions(user_id) values (v_user.id) returning app_sessions.token into v_token;

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role;
end;
$$;

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
  select * into v_user from public.app_users au
  where au.username = lower(trim(p_username)) and au.active = true;

  if v_user is null or v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    raise exception 'Invalid ID or password';
  end if;

  insert into public.app_sessions(user_id) values (v_user.id) returning app_sessions.token into v_token;

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role;
end;
$$;

-- ============================================================================
-- PATCH 2: fixes "function gen_salt(unknown) does not exist"
-- Supabase installs pgcrypto into the "extensions" schema, not "public".
-- Our functions were set to search_path = public only, so they couldn't see
-- crypt()/gen_salt() there. This adds "extensions" to the search_path of
-- every function that hashes/checks a password.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.bootstrap_admin(
  p_username text,
  p_password text,
  p_full_name text
) returns table(token uuid, id uuid, username text, full_name text, role text)
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

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role;
end;
$$;

create or replace function public.login(
  p_username text,
  p_password text
) returns table(token uuid, id uuid, username text, full_name text, role text)
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

  return query select v_token, v_user.id, v_user.username, v_user.full_name, v_user.role;
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
  values (lower(trim(p_username)), extensions.crypt(p_password, extensions.gen_salt('bf')), p_full_name, p_role, true)
  returning * into v_new;

  insert into public.audit_log(action, performed_by, details)
  values ('create_user', v_caller.id, jsonb_build_object('created_user', v_new.username, 'role', p_role));

  return v_new;
end;
$$;

create or replace function public.admin_reset_password(
  p_token uuid,
  p_user_id uuid,
  p_new_password text
) returns void
language plpgsql
security definer
set search_path = public, extensions
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
    set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
    where id = p_user_id;

  delete from public.app_sessions where user_id = p_user_id;

  insert into public.audit_log(action, performed_by, details)
  values ('reset_password', v_caller.id, jsonb_build_object('target_user_id', p_user_id));
end;
$$;
