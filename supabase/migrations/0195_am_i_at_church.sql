/*
 * Am I at church? The dot on the Dashboard (0191, 0192).
 *
 * The app reads the phone's position when it is opened and asks this
 * whether that is at church, so a green dot can say CLOCK IN will work
 * before anybody presses it. The church's spot stays the Owner's and
 * Admins' to read: this answers with a state and a rounded distance, not
 * the pin. Nothing is kept — the position is weighed and forgotten.
 *
 * Three answers, and the honest one when the phone is not sure:
 *  - `in`: what CLOCK IN would accept — within the radius, and the phone
 *    sure enough of itself (Settings › Clock in);
 *  - `out`: outside the radius even at the near edge of what the phone
 *    says it is sure to;
 *  - `unsure`: anything between — a rough reading indoors that might be
 *    in the hall or across the road. Never red to somebody standing at
 *    the door.
 * And `no_place` until the church's spot is set.
 */
create or replace function public.clock_in_where_am_i(lat double precision, lng double precision, accuracy double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  place public.clock_in_place%rowtype;
  radius double precision := coalesce((select clock_in_radius_m from public.app_settings limit 1), 100);
  cap double precision := coalesce((select clock_in_accuracy_m from public.app_settings limit 1), 50);
  sure double precision := greatest(coalesce(accuracy, 1e9), 0);
  away double precision;
  state text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'That is not a position';
  end if;
  select * into place from public.clock_in_place limit 1;
  if not found then return jsonb_build_object('state', 'no_place'); end if;

  away := public.metres_between(place.latitude, place.longitude, lat, lng);
  state := case
    when away <= radius and sure <= cap then 'in'
    when away - sure > radius then 'out'
    else 'unsure'
  end;
  return jsonb_build_object(
    'state', state,
    -- Rounded: near enough to read, not a measuring tape to the pin.
    'distance_m', case when away < 1000 then round(away / 10) * 10 else round(away / 100) * 100 end,
    'radius_m', radius,
    'accuracy_m', round(sure),
    'needed_m', cap
  );
end;
$$;

revoke all on function public.clock_in_where_am_i(double precision, double precision, double precision) from public, anon;
grant execute on function public.clock_in_where_am_i(double precision, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
