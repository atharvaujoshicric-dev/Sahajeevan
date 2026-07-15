-- PATCH: adds admin-editable booking date, amount received, and Channel
-- Partner (CP) details to bookings, plus a new admin-only function to edit
-- them. Safe to run on an existing database — only adds columns and
-- replaces get_bookings() (existing rows get amount_received=0, CP fields NULL).

-- ---- 1. New columns on bookings -------------------------------------------
alter table public.bookings add column if not exists amount_received numeric not null default 0;
alter table public.bookings add column if not exists cp_name text;
alter table public.bookings add column if not exists cp_firm_name text;
alter table public.bookings add column if not exists cp_number text;
alter table public.bookings add column if not exists cp_email text;

-- ---- 2. New admin-only edit function ---------------------------------------
create or replace function public.admin_update_booking_details(
  p_token uuid,
  p_booking_id uuid,
  p_booked_at timestamptz,
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
  v_booking public.bookings;
begin
  v_caller := public._session_user(p_token);
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'Only admin can edit booking details';
  end if;
  if p_amount_received is not null and p_amount_received < 0 then
    raise exception 'Amount received cannot be negative';
  end if;

  update public.bookings
    set booked_at = coalesce(p_booked_at, booked_at),
        amount_received = coalesce(p_amount_received, amount_received),
        cp_name = p_cp_name,
        cp_firm_name = p_cp_firm_name,
        cp_number = p_cp_number,
        cp_email = p_cp_email
    where id = p_booking_id
    returning * into v_booking;

  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  insert into public.audit_log(flat_id, action, performed_by, details)
    values (v_booking.flat_id, 'update_booking_details', v_caller.id,
            jsonb_build_object('booking_id', p_booking_id, 'amount_received', p_amount_received));

  return v_booking;
end;
$$;

grant execute on function public.admin_update_booking_details(uuid, uuid, timestamptz, numeric, text, text, text, text) to anon;

-- ---- 3. Replace get_bookings() with the wider return signature -----------
drop function if exists public.get_bookings(uuid);

create or replace function public.get_bookings(p_token uuid)
returns table (
  id uuid, flat_id text, buyer_name text, buyer_phone text, buyer_email text,
  agreement_value numeric, effective_agreement_value numeric, stamp_duty_rate numeric, registration numeric,
  stamp_duty numeric, gst numeric, package_total numeric,
  cc_included boolean, cc_amount numeric, status text,
  booked_by uuid, booked_by_name text, booked_at timestamptz,
  amount_received numeric, cp_name text, cp_firm_name text, cp_number text, cp_email text,
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
           b.agreement_value, b.effective_agreement_value, b.stamp_duty_rate, b.registration,
           b.stamp_duty, b.gst, b.package_total,
           b.cc_included, b.cc_amount, b.status,
           b.booked_by, coalesce(u.full_name, u.username, 'Unknown') as booked_by_name, b.booked_at,
           b.amount_received, b.cp_name, b.cp_firm_name, b.cp_number, b.cp_email,
           b.cancelled_by, b.cancelled_at, b.cancellation_reason,
           f.tower, f.unit_no, f.configuration_type
    from public.bookings b
    join public.flats f on f.id = b.flat_id
    left join public.app_users u on u.id = b.booked_by
    order by b.booked_at desc;
end;
$$;

grant execute on function public.get_bookings(uuid) to anon;

NOTIFY pgrst, 'reload schema';
