/*
 * An Admin's Yes on Clock In and Stage Layout is a choice.
 *
 * Seven cells in the grid were fixed at Yes for an Admin because the
 * functions behind them passed an Admin before they asked may(): seeing
 * the Clock In page and every clock-in, approving a request to be clocked
 * in, and Stage Layout's five switches. A No there would have been untrue
 * (0269 said so and left them). The Owner asked for an Admin's abilities
 * to be switches too (November 2026), so the functions ask the grid and
 * the cells become a choice — No or Everywhere, starting at Everywhere,
 * so nothing changes for anybody until one is changed.
 *
 * - may_see_clock_ins() and may_approve_clock_ins() ask may() alone (and
 *   Overwatch's room, as before). The Owner passes may() always.
 * - stage_may() asks may() for the five switches; any other privilege is
 *   an Admin's, as it was.
 * - What stays an Admin's and the Owner's by standing, because it is not
 *   a row in the grid: setting where church is, correcting a clock-in
 *   (clock_in_admin), and approving a block move, locking a block or
 *   deciding a template request on a stage.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('clockin.view', 'admin', '{none,all}', 'all'),
  ('clockin.approve', 'admin', '{none,all}', 'all'),
  ('stage.add', 'admin', '{none,all}', 'all'),
  ('stage.edit', 'admin', '{none,all}', 'all'),
  ('stage.delete', 'admin', '{none,all}', 'all'),
  ('stage.comment', 'admin', '{none,all}', 'all'),
  ('stage.templates', 'admin', '{none,all}', 'all')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

create or replace function public.may_see_clock_ins(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.overwatch_sees(uid, 'clock-in')
    or public.may(uid, 'clockin.view')
  );
$$;

create or replace function public.may_approve_clock_ins(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and public.may(uid, 'clockin.approve');
$$;

create or replace function public.stage_may(uid uuid, priv text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and case
    when priv in ('add', 'edit', 'delete', 'comment', 'templates') then public.may(uid, 'stage.' || priv)
    else public.is_admin(uid)
  end;
$$;

notify pgrst, 'reload schema';
