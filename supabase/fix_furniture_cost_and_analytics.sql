-- PATCH: Furniture Cost (formerly "Cash Component") now deducts from the
-- Agreement Value when opted into a booking, and get_bookings() now also
-- returns the sales person's name + the furniture-adjusted Agreement Value
-- (needed for the new admin analytics and the booking sheet).
--
-- Safe to run on an existing database — alters bookings' generated columns
-- and replaces get_bookings(). Does not touch any existing booking rows'
-- input data (agreement_value, cc_amount, etc.) — only how the derived
-- columns are calculated from them.

-- ---- 1. Rebuild the affected generated columns on bookings ----------------
alter table public.bookings drop column if exists stamp_duty;
alter table public.bookings drop column if exists gst;
alter table public.bookings drop column if exists package_total;
alter table public.bookings drop column if exists effective_agreement_value;

alter table public.bookings add column effective_agreement_value numeric generated always as (
  agreement_value - case when cc_included then cc_amount else 0 end
) stored;

alter table public.bookings add column stamp_duty numeric generated always as (
  round((agreement_value - case when cc_included then cc_amount else 0 end) * stamp_duty_rate)
) stored;

alter table public.bookings add column gst numeric generated always as (
  round((agreement_value - case when cc_included then cc_amount else 0 end) * 0.05)
) stored;

alter table public.bookings add column package_total numeric generated always as (
  round(
    (agreement_value - case when cc_included then cc_amount else 0 end)
    + ((agreement_value - case when cc_included then cc_amount else 0 end) * stamp_duty_rate)
    + registration
    + ((agreement_value - case when cc_included then cc_amount else 0 end) * 0.05)
  )
) stored;

-- ---- 2. Replace get_bookings() with the wider return signature -----------
drop function if exists public.get_bookings(uuid);

create or replace function public.get_bookings(p_token uuid)
returns table (
  id uuid, flat_id text, buyer_name text, buyer_phone text, buyer_email text,
  agreement_value numeric, effective_agreement_value numeric, stamp_duty_rate numeric, registration numeric,
  stamp_duty numeric, gst numeric, package_total numeric,
  cc_included boolean, cc_amount numeric, status text,
  booked_by uuid, booked_by_name text, booked_at timestamptz,
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
