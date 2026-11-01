-- Who has allowed location also says which browser (0228).
--
-- Allowing location is a different setting in Chrome, Samsung Internet,
-- Firefox, Edge and an app's own in-app browser, and a different one again
-- in the installed app. "Android · Blocked" did not say which to walk
-- somebody through; "Android · Samsung Internet · Blocked" does. The app
-- sends the browser it detected (lib/installGuide); an older build that
-- does not is still accepted, and keeps whatever was said before.

alter table public.location_access
  add column if not exists browser text;

-- One function, so a call with three arguments is not ambiguous between two.
drop function if exists public.report_location_access(text, text, boolean);

create or replace function public.report_location_access(
  p_state text,
  p_platform text,
  p_installed boolean,
  p_browser text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  said_browser text := case
    when p_browser in ('safari', 'chrome', 'edge', 'firefox', 'samsung', 'opera', 'brave', 'inapp', 'unknown') then p_browser
    else null
  end;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  if p_state not in ('granted', 'denied', 'unknown') then
    raise exception 'Not a location answer: %', p_state;
  end if;

  insert into public.location_access (user_id, state, platform, installed, browser, reported_at)
  values (
    me,
    p_state,
    case when p_platform in ('ios', 'android', 'desktop') then p_platform else 'other' end,
    coalesce(p_installed, false),
    said_browser,
    now()
  )
  on conflict (user_id) do update
    set state = excluded.state,
        platform = excluded.platform,
        installed = excluded.installed,
        browser = coalesce(excluded.browser, public.location_access.browser),
        reported_at = now();

  if p_state = 'granted' then
    update public.notifications
      set read_boolean = true
      where user_id = me and type = 'location_prompt' and read_boolean = false;
  end if;
end;
$function$;

revoke all on function public.report_location_access(text, text, boolean, text) from public, anon;
grant execute on function public.report_location_access(text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
