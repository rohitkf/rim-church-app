-- A link to a video tutorial, set by the Owner.
--
-- The account menu shows "Video tutorial" when there is a link here, and
-- nothing when there is not. Only the Owner may set it (Settings › Video
-- Tutorial): an Admin can edit the rest of the row, so, as for the logo
-- (0089), a trigger guards the one column a policy cannot.
--
-- Only an http(s) link is kept, so the menu never opens a javascript: or
-- data: address whatever is typed.

alter table public.app_settings
  add column if not exists video_tutorial_url text;

alter table public.app_settings
  drop constraint if exists app_settings_video_tutorial_url_is_a_link;
alter table public.app_settings
  add constraint app_settings_video_tutorial_url_is_a_link
  check (video_tutorial_url is null or (video_tutorial_url ~* '^https?://[^\s]+$' and length(video_tutorial_url) <= 2000));

create or replace function public.app_settings_video_is_the_owners()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.video_tutorial_url is distinct from old.video_tutorial_url
     and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can change the video tutorial link';
  end if;
  return new;
end;
$$;

-- Alphabetically before app_settings_touch, so it decides first.
drop trigger if exists app_settings_video_is_the_owners on public.app_settings;
create trigger app_settings_video_is_the_owners
  before update on public.app_settings
  for each row execute function public.app_settings_video_is_the_owners();

revoke all on function public.app_settings_video_is_the_owners() from public, anon, authenticated;

notify pgrst, 'reload schema';
