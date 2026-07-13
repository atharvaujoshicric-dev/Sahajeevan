-- PATCH: fixes "DELETE requires a WHERE clause" on Reset System Data.
-- Supabase enables the pg-safeupdate extension by default, which blocks any
-- DELETE/UPDATE statement that has no WHERE clause — even inside a
-- SECURITY DEFINER function. Adding a harmless "where true" satisfies it
-- without changing what gets deleted (still everything).
-- Safe to run anytime — just replaces this one function.

create or replace function public.admin_reset_system_data(
  p_token uuid,
  p_confirm text
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
    raise exception 'Only admin can reset system data';
  end if;
  if p_confirm <> 'RESET' then
    raise exception 'Confirmation text did not match';
  end if;

  delete from public.bookings where true;

  update public.flats
    set status = 'Available',
        cc_enabled = false,
        cc_amount = 0,
        updated_at = now()
    where true;

  delete from public.audit_log where true;

  insert into public.audit_log(action, performed_by, details)
    values ('reset_system_data', v_caller.id, jsonb_build_object('at', now()));
end;
$$;

NOTIFY pgrst, 'reload schema';
