-- A DBS mark is for the details that were checked.
--
-- A checker opens somebody's DBS details, looks them up on the DBS's own
-- site, and marks them verified. verify_dbs() then stamped whatever
-- details were stored at the moment of the click. The person can change
-- their own details at any time (save_my_dbs), and a change clears an
-- existing mark, but a change made between the checker's reading and the
-- checker's click cleared nothing, because there was no mark yet: the
-- mark then landed on details nobody had looked at. A security review
-- (November 2026, N19) found it, and the Owner said to tie the two.
--
-- So the details carry a fingerprint, the checker's screen is given it
-- with the details (dbs_of), and sends it back with the click. If it is
-- not the fingerprint of what is stored now, nothing is marked and the
-- checker is told to look again. It is not a secret and not a signature:
-- it is "the same as you saw", and whoever is sent it is sent the details
-- themselves.
--
-- A click that sends none is refused too. That is every click from a page
-- loaded before this, for the few minutes until the new page is out; the
-- refusal says to open the details again, which is also what mends it.

create or replace function public.dbs_seen(d public.dbs_details)
returns text
language sql
immutable
set search_path = public
as $function$
  -- What a checker checks, and nothing the checking itself changes: not the
  -- mark, the ticks or updated_at, which verify_dbs writes.
  select md5(concat_ws(
    chr(31),
    coalesce(d.kind, ''),
    coalesce(d.certificate_number, ''),
    coalesce(d.surname, ''),
    coalesce(d.issued_on::text, ''),
    coalesce(d.workforce, ''),
    coalesce(d.update_service::text, ''),
    coalesce(d.share_code, ''),
    coalesce(d.consented_at::text, '')
  ));
$function$;
revoke all on function public.dbs_seen(public.dbs_details) from public, anon, authenticated;
comment on function public.dbs_seen(public.dbs_details) is
  'A fingerprint of the DBS details a checker looks at, so a mark can be refused if they changed in between (0335).';

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
        'id_seen', d.id_seen,
        -- 0335: what verify_dbs() must be handed back.
        'seen', public.dbs_seen(d)
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

-- One more thing to hand over, so the old shape goes and the new one stands in its place.
drop function if exists public.verify_dbs(uuid, boolean, boolean, boolean);

create or replace function public.verify_dbs(
  p_person uuid,
  p_status_checked boolean,
  p_certificate_seen boolean,
  p_id_seen boolean,
  p_seen text default null
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
  stored text;
begin
  if me is null or not public.may(me, 'people.compliance') then
    raise exception 'You may not check DBS details.' using errcode = '42501';
  end if;
  -- Nobody checks their own, bar the Owner (0325): there is nobody above them to do it.
  if p_person is not distinct from me and not public.is_super_admin(me) then
    raise exception 'Somebody else has to check your own DBS.' using errcode = '42501';
  end if;
  if not (coalesce(p_status_checked, false) or coalesce(p_certificate_seen, false) or coalesce(p_id_seen, false)) then
    raise exception 'Tick what you checked.' using errcode = '22023';
  end if;

  -- Held while it is compared and marked, so a change cannot slip between the two.
  select public.dbs_seen(d) into stored from public.dbs_details d where d.user_id = p_person for update;
  if not found then
    raise exception 'They have not given any DBS details.' using errcode = 'P0002';
  end if;
  if p_seen is null then
    raise exception 'Open their DBS details again, then mark them verified.';
  end if;
  if p_seen <> stored then
    raise exception 'These details were changed after you opened them. Look at them again before you mark them verified.';
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

  checked := concat_ws(', ',
    case when coalesce(p_status_checked, false) then 'checked online' end,
    case when coalesce(p_certificate_seen, false) then 'original certificate seen' end,
    case when coalesce(p_id_seen, false) then 'photo ID seen' end);
  insert into public.dbs_log (user_id, event, by, kind, wording)
  values (p_person, 'verified', me, its_kind, checked);
end;
$function$;

revoke all on function public.verify_dbs(uuid, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.verify_dbs(uuid, boolean, boolean, boolean, text) to authenticated;
comment on function public.verify_dbs(uuid, boolean, boolean, boolean, text) is
  'Marks somebody''s DBS details verified, if they are still the details the checker was shown (p_seen, from dbs_of). 0335.';

notify pgrst, 'reload schema';
select public.migration_done(335, '0335_a_dbs_mark_is_for_the_details_that_were_checked', 'bf7907408d90fe1bb10a9c088e599bb4774cc6888d8c218e55a400a3a3d98c3f');
