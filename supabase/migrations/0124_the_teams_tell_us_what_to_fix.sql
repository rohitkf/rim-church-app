/*
 * The teams tell us what to fix.
 *
 * A Feedback page for anybody on a team (not Church Members): report a
 * bug, suggest an idea or an improvement, say what was confusing, say
 * what works — about the app itself, not about a Sunday (that is Issues).
 *
 * Admins and the Owner read all of it, grouped by its type, mark each one
 * New → Looking into it → Done or Won't do, and can reply. The person who
 * sent it sees their own, with its status and the reply, and is told when
 * either changes. Every new piece rings every Admin's bell and phone.
 *
 * Written only through two functions, so there is no insert or update
 * policy: who may send, and who is told, is decided here, not by a
 * client's list of recipients.
 *
 * Done and Won't-do feedback can be cleared on a clock
 * (feedback_retention_days, Settings › Data & retention). Null — the
 * default — keeps it for ever.
 */

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('bug', 'idea', 'improvement', 'confusing', 'praise', 'other')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'looking', 'done', 'wont_do')),
  reply text check (reply is null or char_length(reply) <= 2000),
  replied_by uuid references public.profiles (id) on delete set null,
  status_changed_at timestamptz
);

create index if not exists app_feedback_created_by_idx on public.app_feedback (created_by);
create index if not exists app_feedback_kind_status_idx on public.app_feedback (kind, status);

alter table public.app_feedback enable row level security;

-- Your own, or everybody's if you are an Admin (the Owner is one).
create policy app_feedback_select on public.app_feedback for select
  using (created_by = auth.uid() or public.is_admin(auth.uid()));

-- Take back something you sent while nobody has picked it up yet; an
-- Admin can clear anything.
create policy app_feedback_delete on public.app_feedback for delete
  using ((created_by = auth.uid() and status = 'new') or public.is_admin(auth.uid()));

/* ------------------------------------------------------------------ */

/* Every Admin, and the Owner, who is told about new feedback. */
create or replace function public.app_admin_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct id), '{}') from (
    select user_id as id from public.user_roles where role_type = 'admin'
    union
    select user_id from public.app_owner
  ) people;
$$;

revoke all on function public.app_admin_ids() from public, anon, authenticated;

create or replace function public.submit_feedback(p_kind text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  made uuid;
  line text;
begin
  if not public.is_on_a_team(auth.uid()) then
    raise exception 'Feedback is for people on a team.' using errcode = '42501';
  end if;

  insert into public.app_feedback (kind, body, created_by)
  values (p_kind, btrim(p_body), auth.uid())
  returning id into made;

  -- The first line, kept short: it is what a lock screen shows.
  line := left(split_part(btrim(p_body), E'\n', 1), 140);
  perform public.notify_people(
    public.app_admin_ids(),
    'feedback_received',
    made,
    initcap(replace(p_kind, '_', ' ')) || ': ' || line
  );
  return made;
end;
$$;

revoke all on function public.submit_feedback(text, text) from public, anon;
grant execute on function public.submit_feedback(text, text) to authenticated;

/*
 * An Admin sets where a piece of feedback stands and, if they like, says
 * something back. The sender is told when either changes.
 */
create or replace function public.mark_feedback(p_id uuid, p_status text, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  was public.app_feedback%rowtype;
  next_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can answer feedback.' using errcode = '42501';
  end if;

  select * into was from public.app_feedback where id = p_id for update;
  if not found then
    raise exception 'That feedback is no longer there.' using errcode = 'P0002';
  end if;

  update public.app_feedback
  set status = p_status,
      reply = next_reply,
      replied_by = case when next_reply is distinct from was.reply then auth.uid() else replied_by end,
      status_changed_at = case when p_status <> was.status then now() else status_changed_at end
  where id = p_id;

  if p_status <> was.status or next_reply is distinct from was.reply then
    perform public.notify_people(
      array[was.created_by],
      'feedback_answered',
      p_id,
      case p_status
        when 'looking' then 'Your feedback is being looked into.'
        when 'done' then 'Your feedback has been dealt with.'
        when 'wont_do' then 'Your feedback has been answered.'
        else 'Your feedback has a reply.'
      end
    );
  end if;
end;
$$;

revoke all on function public.mark_feedback(uuid, text, text) from public, anon;
grant execute on function public.mark_feedback(uuid, text, text) to authenticated;

/* ------------------------------------------------------------------ *
 * How long it is kept
 * ------------------------------------------------------------------ */

alter table public.app_settings
  add column if not exists feedback_retention_days integer
    check (feedback_retention_days is null or feedback_retention_days between 1 and 3650);

-- 0123's job, with feedback added. Only what is settled — Done or Won't
-- do — is cleared, counted from when it was settled.
create or replace function public.apply_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings%rowtype;
begin
  select * into s from public.app_settings limit 1;
  if not found then
    return;
  end if;

  if s.notification_retention_days is not null then
    delete from public.notifications
    where created_at < now() - make_interval(days => s.notification_retention_days);
  end if;

  if s.team_chat_retention_days is not null then
    delete from public.team_messages
    where created_at < now() - make_interval(days => s.team_chat_retention_days);
  end if;

  if s.church_update_retention_days is not null then
    delete from public.church_updates
    where not pinned
      and created_at < now() - make_interval(days => s.church_update_retention_days);
  end if;

  if s.poll_retention_days is not null then
    delete from public.team_polls
    where coalesce(closes_at, created_at) < now() - make_interval(days => s.poll_retention_days);
  end if;

  if s.alert_retention_days is not null then
    delete from public.announcements
    where created_at < now() - make_interval(days => s.alert_retention_days);
  end if;

  if s.feedback_retention_days is not null then
    delete from public.app_feedback
    where status in ('done', 'wont_do')
      and coalesce(status_changed_at, created_at) < now() - make_interval(days => s.feedback_retention_days);
  end if;
end;
$$;

revoke all on function public.apply_retention() from public, anon, authenticated;

/* The list moves on every Admin's screen as it arrives. */
do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_feedback'
     ) then
    alter publication supabase_realtime add table public.app_feedback;
  end if;
end $pub$;

notify pgrst, 'reload schema';
