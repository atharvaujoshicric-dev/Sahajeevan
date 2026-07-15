-- ============================================================================
-- FULL REBUILD — the definitive fix for schema-mismatch errors like:
--   "insert or update on table X violates foreign key constraint ..._fkey"
-- These happen when your live database still has objects (tables, or old
-- versions of a function with a different signature) left over from an
-- earlier iteration of this schema. Patching individual functions can't fix
-- that — this script drops everything this app owns, cleanly, so the next
-- fresh run of schema.sql has nothing old left to conflict with.
--
-- Safe to run now since you're still in testing: it deletes all
-- flats/bookings/users/sessions/audit log. Nothing else in your Supabase
-- project is touched.
--
-- HOW TO USE (run these three files in this exact order):
--   1. full_rebuild.sql   (this file)
--   2. schema.sql
--   3. seed_data.sql
-- Then reload the app — you'll see "Create Admin Account" again since all
-- logins were wiped too.
-- ============================================================================

-- Drop every function this app has ever used, under ANY signature it has
-- ever had (so a signature that drifted across earlier versions can't leave
-- a stray overload behind that conflicts with the new one).
do $$
declare
  r record;
  fn_names text[] := array[
    '_session_user','admin_exists','bootstrap_admin','login','whoami','logout',
    'admin_list_users','admin_create_user','admin_update_user','admin_reset_password',
    'admin_delete_user','get_flats','get_bookings','get_booking_for_flat',
    'update_flat_pricing','set_flat_cc','book_flat','cancel_booking',
    'admin_reset_system_data','admin_set_flat_unblock',
    'update_booking_date','update_booking_cp_details','admin_update_booking_details', -- current + old names, if present
    'is_admin','is_active_user' -- old Supabase-Auth-era helpers, if present
  ];
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(fn_names)
  loop
    execute format('drop function if exists public.%I(%s) cascade;', r.proname, r.args);
  end loop;
end $$;

-- Drop every table this app owns (and anything from the old Supabase-Auth
-- version, if present).
drop table if exists public.audit_log cascade;
drop table if exists public.bookings cascade;
drop table if exists public.flats cascade;
drop table if exists public.app_sessions cascade;
drop table if exists public.app_users cascade;
drop table if exists public.profiles cascade;

NOTIFY pgrst, 'reload schema';
