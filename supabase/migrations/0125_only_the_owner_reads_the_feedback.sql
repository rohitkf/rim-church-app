/*
 * Only the Owner reads the feedback.
 *
 * 0124 let every Admin read everybody's feedback, mark it and reply. The
 * church wants that to be the Owner's alone: feedback about the app goes
 * to whoever runs the app. An Admin is now like anybody else on a team
 * here — they send feedback and see their own, with its status and reply.
 *
 *   - select: your own, or everything if you are the Owner.
 *   - delete: your own while it is still New, or anything if you are the Owner.
 *   - mark_feedback: the Owner only.
 *   - submit_feedback: rings only the Owner's bell and phone.
 *
 * `is_super_admin(uid)` is the existing "is this the Owner" test (app_owner).
 * app_admin_ids() from 0124 is left in place, unused by feedback now.
 */

alter policy app_feedback_select on public.app_feedback
  using (created_by = auth.uid() or public.is_super_admin(auth.uid()));

alter policy app_feedback_delete on public.app_feedback
  using ((created_by = auth.uid() and status = 'new') or public.is_super_admin(auth.uid()));

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
    coalesce(array(select user_id from public.app_owner), '{}'),
    'feedback_received',
    made,
    initcap(replace(p_kind, '_', ' ')) || ': ' || line
  );
  return made;
end;
$$;

revoke all on function public.submit_feedback(text, text) from public, anon;
grant execute on function public.submit_feedback(text, text) to authenticated;

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
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only the Owner can answer feedback.' using errcode = '42501';
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

notify pgrst, 'reload schema';
