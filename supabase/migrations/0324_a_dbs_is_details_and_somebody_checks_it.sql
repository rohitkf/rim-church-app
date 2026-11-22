/*
 * A DBS is details, and somebody checks it.
 *
 * "Do you have a valid DBS check?" was a yes or a no (0097), and that was
 * all the church had: nothing to check the answer against, no date, and
 * nobody to say it had been looked at. The Owner asked (November 2026)
 * for what a check needs to be collected from everybody who says yes, for
 * how old the certificate is to be shown, for an Admin to mark it
 * verified, and for the details to be compulsory: no details, no app.
 *
 *   dbs_details    one row for somebody who has said yes and given the
 *                  details: which check, the certificate number, the
 *                  surname on it, the date it was issued, and for a
 *                  Standard or Enhanced check the workforce it is for and
 *                  whether it is on the Update Service. A Basic check can
 *                  carry the share code from a DBS online account. Then
 *                  when they gave permission, and who checked it, when,
 *                  and what they looked at.
 *   dbs_log        what happened and when, added to and never changed:
 *                  permission given (with the words agreed to), checked,
 *                  the check taken back, the details removed.
 *
 * **What a check needs** is GOV.UK's list, not ours. An Update Service
 * status check asks for the certificate number, the current surname as
 * the certificate has it, and the date of birth, and it is for Standard
 * and Enhanced certificates only. Before one is run the original
 * certificate and the person's ID have to have been seen. A Basic
 * certificate is shown from the holder's DBS online account with a share
 * code. The date of birth is the profile's own (0321): not asked twice.
 *
 * **A Basic check gives the share code, the certificate number, or
 * both.** A share code only exists for somebody who applied online
 * themselves; a Basic certificate that came through an employer is paper,
 * with a number. Asking for the code alone would shut that person out.
 *
 * **Written through one function, by the person.** `save_my_dbs()` takes
 * the details and the permission together and refuses either without the
 * other. The table has no insert or update for anybody: `verified_at`
 * sits on the same row, and a row somebody can write is a row they can
 * mark as checked.
 *
 * **Permission is said each time and kept.** The box is the person's to
 * tick. The words they agreed to are the database's, `dbs_consent_wording()`,
 * copied into the log with the time, so what was agreed to is on record
 * even after the words change.
 *
 * **Changed details are unchecked details.** What was verified is the
 * certificate that was looked at. A different number, surname, date or
 * check is a different certificate, so the mark comes off and the log
 * says so. A new share code is not a different certificate.
 *
 * **Nobody checks their own.** `verify_dbs()` is for whoever holds
 * `people.compliance` (the Owner alone out of the box, 0126), and refuses
 * the person's own. It records what was looked at: the status check, the
 * original certificate, photo ID. A share code is spent once used, so it
 * is cleared when the check is recorded, unless it is all the row has.
 *
 * **"No" takes the details away.** Somebody who changes their answer to
 * no has no certificate for the church to hold a number for. The row goes
 * and the log keeps that it did.
 *
 * **Form 5.** `profile_gaps()` lists `dbsKind` for somebody who says yes
 * and has given nothing, from form 5 on, so an app from before this is
 * never held behind questions it cannot put (0301).
 */

-- ---------------------------------------------------------------------------
-- The details
-- ---------------------------------------------------------------------------

create table public.dbs_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('enhanced', 'standard', 'basic')),
  certificate_number text check (certificate_number ~ '^[0-9]{12}$'),
  surname text not null check (char_length(btrim(surname)) between 1 and 80),
  issued_on date not null,
  workforce text check (workforce in ('child', 'adult', 'both', 'other')),
  update_service boolean,
  share_code text check (share_code ~ '^[A-Z0-9]{4,20}$'),
  consented_at timestamptz not null,
  consent_wording text not null,
  verified_at timestamptz,
  -- Kept when the person who checked goes: that it was checked outlives who did.
  verified_by uuid references public.profiles(id) on delete set null,
  status_checked boolean not null default false,
  certificate_seen boolean not null default false,
  id_seen boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint dbs_details_standard_or_enhanced_is_whole
    check (kind = 'basic' or (certificate_number is not null and workforce is not null and update_service is not null)),
  constraint dbs_details_basic_asks_less
    check (kind <> 'basic' or (workforce is null and update_service is null)),
  constraint dbs_details_only_basic_has_a_share_code
    check (kind = 'basic' or share_code is null),
  -- Something to check it by: a code, a number, or that it has been checked.
  constraint dbs_details_basic_can_be_checked
    check (kind <> 'basic' or share_code is not null or certificate_number is not null)
);

comment on table public.dbs_details is
  'The details of somebody''s DBS certificate, for whoever says they have one (0324): what a check needs, when they gave permission, and who checked it and how. Written only through save_my_dbs() by the person and verify_dbs() / unverify_dbs() by whoever holds people.compliance. Read by the person and by people.compliance.';

create index dbs_details_verified_by_idx on public.dbs_details (verified_by);

alter table public.dbs_details enable row level security;

create policy dbs_details_select on public.dbs_details
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.may((select auth.uid()), 'people.compliance'))
  );

revoke all on public.dbs_details from anon;
revoke all on public.dbs_details from authenticated;
grant select on public.dbs_details to authenticated;

create trigger dbs_details_live after insert or update or delete on public.dbs_details
  for each statement execute function public.live_table_changed();

-- ---------------------------------------------------------------------------
-- What happened, and when
-- ---------------------------------------------------------------------------

create table public.dbs_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now(),
  event text not null check (event in ('consent', 'verified', 'unverified', 'removed')),
  -- Who did it: the person for their own permission, whoever checked for a check.
  by uuid references public.profiles(id) on delete set null,
  kind text,
  -- The words agreed to, for a 'consent'; what was looked at or why, for the rest.
  wording text
);

comment on table public.dbs_log is
  'What happened to somebody''s DBS details and when (0324): permission given (with the words agreed to), checked, the check taken back, the details removed. Added to by the functions and never changed. Read by the person and by people.compliance.';

create index dbs_log_user_idx on public.dbs_log (user_id, at);
create index dbs_log_by_idx on public.dbs_log (by);

alter table public.dbs_log enable row level security;

create policy dbs_log_select on public.dbs_log
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.may((select auth.uid()), 'people.compliance'))
  );

revoke all on public.dbs_log from anon;
revoke all on public.dbs_log from authenticated;
grant select on public.dbs_log to authenticated;

-- ---------------------------------------------------------------------------
-- The words agreed to
-- ---------------------------------------------------------------------------

create or replace function public.dbs_consent_wording()
returns text
language sql
immutable
set search_path = ''
as $function$
  select 'I give the church permission to use these details to check my DBS certificate, and to keep a record that it was checked.';
$function$;

revoke all on function public.dbs_consent_wording() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The person gives their details, and permission with them
-- ---------------------------------------------------------------------------

create or replace function public.save_my_dbs(
  p_kind text,
  p_certificate text,
  p_surname text,
  p_issued_on date,
  p_workforce text,
  p_update_service boolean,
  p_share_code text,
  p_consent boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  basic boolean := p_kind is not distinct from 'basic';
  -- As typed, less the spaces and dashes people copy a number with.
  cert text := nullif(regexp_replace(coalesce(p_certificate, ''), '[[:space:]-]', '', 'g'), '');
  code text := nullif(upper(regexp_replace(coalesce(p_share_code, ''), '[[:space:]-]', '', 'g')), '');
  named text := btrim(regexp_replace(coalesce(p_surname, ''), '[[:space:]]+', ' ', 'g'));
  today date := (now() at time zone 'Europe/London')::date;
  was public.dbs_details;
  had boolean;
  changed boolean;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_consent is not true then
    raise exception 'Tick the box to give permission for the check.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('enhanced', 'standard', 'basic') then
    raise exception 'Choose which DBS check you have.' using errcode = '22023';
  end if;
  if cert is not null and cert !~ '^[0-9]{12}$' then
    raise exception 'A DBS certificate number is 12 digits.' using errcode = '22023';
  end if;
  if not basic and cert is null then
    raise exception 'Enter the 12-digit certificate number.' using errcode = '22023';
  end if;
  if named = '' then
    raise exception 'Enter the surname on the certificate.' using errcode = '22023';
  end if;
  if char_length(named) > 80 then
    raise exception 'Keep the surname to 80 letters or fewer.' using errcode = '22023';
  end if;
  if p_issued_on is null then
    raise exception 'Choose the date the certificate was issued.' using errcode = '22023';
  end if;
  if p_issued_on > today then
    raise exception 'The date of issue cannot be in the future.' using errcode = '22023';
  end if;
  -- The first of these certificates were issued in March 2002.
  if p_issued_on < date '2002-03-01' then
    raise exception 'No certificate is that old. Check the year.' using errcode = '22023';
  end if;
  if basic then
    if code is not null and code !~ '^[A-Z0-9]{4,20}$' then
      raise exception 'That share code does not look right. Copy it exactly as GOV.UK gave it.' using errcode = '22023';
    end if;
    if code is null and cert is null then
      raise exception 'Give the share code or the certificate number.' using errcode = '22023';
    end if;
  else
    if p_workforce is null or p_workforce not in ('child', 'adult', 'both', 'other') then
      raise exception 'Choose the workforce the certificate is for.' using errcode = '22023';
    end if;
    if p_update_service is null then
      raise exception 'Say whether it is on the Update Service.' using errcode = '22023';
    end if;
  end if;

  select * into was from public.dbs_details d where d.user_id = me for update;
  had := found;
  -- A different certificate, not a new share code for the same one.
  changed := not had
    or was.kind <> p_kind
    or was.certificate_number is distinct from cert
    or lower(was.surname) <> lower(named)
    or was.issued_on <> p_issued_on
    or was.workforce is distinct from (case when basic then null else p_workforce end)
    or was.update_service is distinct from (case when basic then null else p_update_service end);

  insert into public.dbs_details as d (
    user_id, kind, certificate_number, surname, issued_on, workforce, update_service, share_code,
    consented_at, consent_wording
  ) values (
    me, p_kind, cert, named, p_issued_on,
    case when basic then null else p_workforce end,
    case when basic then null else p_update_service end,
    case when basic then code end,
    now(), public.dbs_consent_wording()
  )
  on conflict (user_id) do update set
    kind = excluded.kind,
    certificate_number = excluded.certificate_number,
    surname = excluded.surname,
    issued_on = excluded.issued_on,
    workforce = excluded.workforce,
    update_service = excluded.update_service,
    share_code = excluded.share_code,
    consented_at = excluded.consented_at,
    consent_wording = excluded.consent_wording,
    verified_at = case when changed then null else d.verified_at end,
    verified_by = case when changed then null else d.verified_by end,
    status_checked = case when changed then false else d.status_checked end,
    certificate_seen = case when changed then false else d.certificate_seen end,
    id_seen = case when changed then false else d.id_seen end,
    updated_at = now();

  insert into public.dbs_log (user_id, event, by, kind, wording)
  values (me, 'consent', me, p_kind, public.dbs_consent_wording());
  if had and changed and was.verified_at is not null then
    insert into public.dbs_log (user_id, event, by, kind, wording)
    values (me, 'unverified', me, p_kind, 'The details were changed.');
  end if;

  -- Saying yes and giving the details are one act.
  update public.profile_sensitive s set has_dbs = true where s.user_id = me and not s.has_dbs;
  perform public.profile_completion_note(me);
end;
$function$;

revoke all on function public.save_my_dbs(text, text, text, date, text, boolean, text, boolean) from public, anon;
grant execute on function public.save_my_dbs(text, text, text, date, text, boolean, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- "No" takes the details away
-- ---------------------------------------------------------------------------

create or replace function public.dbs_said_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  gone text;
begin
  delete from public.dbs_details d where d.user_id = new.user_id returning d.kind into gone;
  if found then
    insert into public.dbs_log (user_id, event, by, kind, wording)
    values (new.user_id, 'removed', auth.uid(), gone, 'They no longer say they have a DBS check.');
  end if;
  return null;
end;
$function$;

revoke all on function public.dbs_said_no() from public, anon, authenticated;

drop trigger if exists profile_sensitive_dbs_said_no on public.profile_sensitive;
create trigger profile_sensitive_dbs_said_no
  after update of has_dbs on public.profile_sensitive
  for each row
  when (old.has_dbs and not new.has_dbs)
  execute function public.dbs_said_no();

-- ---------------------------------------------------------------------------
-- Somebody else checks it
-- ---------------------------------------------------------------------------

create or replace function public.verify_dbs(
  p_person uuid,
  p_status_checked boolean,
  p_certificate_seen boolean,
  p_id_seen boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  checked text;
  its_kind text;
begin
  if me is null or not public.may(me, 'people.compliance') then
    raise exception 'You may not check DBS details.' using errcode = '42501';
  end if;
  if p_person is not distinct from me then
    raise exception 'Somebody else has to check your own DBS.' using errcode = '42501';
  end if;
  if not (coalesce(p_status_checked, false) or coalesce(p_certificate_seen, false) or coalesce(p_id_seen, false)) then
    raise exception 'Tick what you checked.' using errcode = '22023';
  end if;

  update public.dbs_details d set
    verified_at = now(),
    verified_by = me,
    status_checked = coalesce(p_status_checked, false),
    certificate_seen = coalesce(p_certificate_seen, false),
    id_seen = coalesce(p_id_seen, false),
    -- Used once, and of no use to anybody after. Kept only where it is all the row has to go by.
    share_code = case when d.certificate_number is not null then null else d.share_code end,
    updated_at = now()
  where d.user_id = p_person
  returning d.kind into its_kind;
  if not found then
    raise exception 'They have not given any DBS details.' using errcode = 'P0002';
  end if;

  checked := concat_ws(', ',
    case when coalesce(p_status_checked, false) then 'checked online' end,
    case when coalesce(p_certificate_seen, false) then 'original certificate seen' end,
    case when coalesce(p_id_seen, false) then 'photo ID seen' end);
  insert into public.dbs_log (user_id, event, by, kind, wording)
  values (p_person, 'verified', me, its_kind, checked);
end;
$function$;

revoke all on function public.verify_dbs(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.verify_dbs(uuid, boolean, boolean, boolean) to authenticated;

create or replace function public.unverify_dbs(p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  its_kind text;
begin
  if me is null or not public.may(me, 'people.compliance') then
    raise exception 'You may not check DBS details.' using errcode = '42501';
  end if;
  update public.dbs_details d set
    verified_at = null, verified_by = null,
    status_checked = false, certificate_seen = false, id_seen = false,
    updated_at = now()
  where d.user_id = p_person and d.verified_at is not null
  returning d.kind into its_kind;
  if found then
    insert into public.dbs_log (user_id, event, by, kind, wording)
    values (p_person, 'unverified', me, its_kind, 'The check was taken back.');
  end if;
end;
$function$;

revoke all on function public.unverify_dbs(uuid) from public, anon;
grant execute on function public.unverify_dbs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- One person's, with what a check needs beside it
-- ---------------------------------------------------------------------------
-- The date of birth goes with the certificate number into the check, so
-- whoever may check gets it here whether or not they see ages elsewhere.

create or replace function public.dbs_of(p_person uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  out jsonb;
begin
  if me is null or p_person is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_person <> me and not public.may(me, 'people.compliance') then
    raise exception 'You may not see DBS details.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user_id', p.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'dob', p.dob,
    'has_dbs', coalesce(s.has_dbs, false),
    'details', (
      select jsonb_build_object(
        'kind', d.kind,
        'certificate_number', d.certificate_number,
        'surname', d.surname,
        'issued_on', d.issued_on,
        'workforce', d.workforce,
        'update_service', d.update_service,
        'share_code', d.share_code,
        'consented_at', d.consented_at,
        'consent_wording', d.consent_wording,
        'verified_at', d.verified_at,
        'verified_by', d.verified_by,
        'verified_by_name', nullif(btrim(concat_ws(' ', v.first_name, v.last_name)), ''),
        'status_checked', d.status_checked,
        'certificate_seen', d.certificate_seen,
        'id_seen', d.id_seen
      )
      from public.dbs_details d
      left join public.profiles v on v.id = d.verified_by
      where d.user_id = p.id
    ),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', l.at,
        'event', l.event,
        'kind', l.kind,
        'wording', l.wording,
        'by_name', nullif(btrim(concat_ws(' ', b.first_name, b.last_name)), '')
      ) order by l.at desc, l.id desc)
      from public.dbs_log l
      left join public.profiles b on b.id = l.by
      where l.user_id = p.id
    ), '[]'::jsonb)
  )
  into out
  from public.profiles p
  left join public.profile_sensitive s on s.user_id = p.id
  where p.id = p_person;
  return out;
end;
$function$;

revoke all on function public.dbs_of(uuid) from public, anon;
grant execute on function public.dbs_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Form 5: somebody who says yes gives the details
-- ---------------------------------------------------------------------------

create or replace function public.joining_form()
returns integer
language sql
immutable
set search_path = ''
as $function$
  select 5;
$function$;

revoke all on function public.joining_form() from public, anon, authenticated;

create or replace function public.profile_gaps(p_user uuid, p_form integer)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select array_remove(array[
    case when coalesce(btrim(p.first_name), '') = '' then 'firstName' end,
    -- Somebody with one name has no last name to give (0323).
    case when coalesce(btrim(p.last_name), '') = '' and not p.single_name then 'lastName' end,
    case when coalesce(btrim(p.phone), '') = '' then 'phone' end,
    case when p.dob is null then 'dob'
         -- Form 4 (0321): a date that cannot be theirs is no answer.
         when p_form >= 4 and public.dob_problem(p.dob) is not null then 'dob' end,
    case when coalesce(p.marital_status, '') = '' then 'maritalStatus' end,
    case when p.marital_status is not distinct from 'married' and p.anniversary is null then 'anniversary' end,
    case when coalesce(s.visa_type, '') = '' then 'visaType' end,
    case when coalesce(s.visa_type, '') <> ''
          and s.visa_type not in ('british_citizen', 'irish_citizen', 'ilr', 'eu_settled')
          and s.visa_has_expiry is null
          and s.visa_expiry is null then 'visaHasExpiry' end,
    case when coalesce(s.visa_type, '') <> ''
          and s.visa_type not in ('british_citizen', 'irish_citizen', 'ilr', 'eu_settled')
          and s.visa_has_expiry is true
          and s.visa_expiry is null then 'visaExpiry' end,
    -- Form 5 (0324): a yes with no details behind it. A row is whole or is not there (save_my_dbs).
    case when p_form >= 5 and s.has_dbs is true and d.user_id is null then 'dbsKind' end,
    case when p_form >= 2 and coalesce(btrim(h.address_line1), '') = '' then 'addressLine1' end,
    case when p_form >= 2 and coalesce(btrim(h.town), '') = '' then 'town' end,
    case when p_form >= 2 and coalesce(btrim(h.postcode), '') = '' then 'postcode' end,
    case when p_form >= 2 and coalesce(btrim(p.emergency_contact_name), '') = '' then 'emergencyName' end,
    case when p_form >= 3 and coalesce(p.emergency_contact_relation, '') = '' then 'emergencyRelation' end,
    case when p_form >= 2 and coalesce(btrim(p.emergency_contact_phone), '') = '' then 'emergencyPhone' end
  ], null)
  from public.profiles p
  left join public.profile_sensitive s on s.user_id = p.id
  left join public.dbs_details d on d.user_id = p.id
  -- Their own home: a person is an adult in at most one household (0149).
  left join public.household_members hm on hm.user_id = p.id and hm.kind = 'adult'
  left join public.households h on h.id = hm.household_id
  where p.id = p_user;
$function$;

-- Finished form 4 and never said yes: finished form 5, then.
insert into public.profile_completions (user_id, form, completed_at)
select c.user_id, 5, c.completed_at
from public.profile_completions c
join public.profiles p on p.id = c.user_id
where c.form = 4
  and p.onboarded_at is not null
  and cardinality(public.profile_gaps(c.user_id, 5)) = 0
on conflict (user_id, form) do nothing;
select public.migration_done(324, '0324_a_dbs_is_details_and_somebody_checks_it', '1d79178b7af3b0ee1797173dbc0353e545e6a8684be95cc08e1f8a3b33b0864f');
