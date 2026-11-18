-- A name is written like a name.
--
-- People type their names as they type everything else — "john smith",
-- "JOHN SMITH", " anne - marie " — and the app kept each exactly as it
-- came, so a rota read "john SMITH, Mary jones, PETER". And nothing said a
-- name had to be one: "y@cht_234" was a first name as far as any rule here
-- went. The Owner asked for both to stop (November 2026): everybody's name
-- saved and shown with its capitals, however it was typed, and a name that
-- is not a name refused.
--
-- **The rule is the database's, so it holds for every way in.** A name
-- reaches these tables from a dozen forms, three functions that take one
-- as an argument, the sign-up trigger and an edge function; teaching each
-- of them is how the next one gets forgotten. So one trigger, on every
-- table that keeps a person's name, tidies what arrives and refuses what
-- is not a name. The app's forms apply the same rule first
-- (lib/personName.ts) so that the name is seen as it will be saved and the
-- reason is given beside the field — but that is a courtesy, and this is
-- the rule.
--
-- **What a name is.**
--   person_name_tidy(text)  the name as it is kept: spaces trimmed and
--     squeezed, a curly apostrophe or long dash made the plain one, every
--     word a capital and then small letters. A word starts after a space,
--     a hyphen or a full stop (Anne-Marie, St. John); after an apostrophe
--     only when one letter stands before it (O'Brien, D'Souza, but Sa'id).
--     Mc takes a capital after it (McDonald); Mac does not, because
--     Mackenzie is as common as MacDonald. A capital inside a word is kept
--     only where it was plainly meant — the word typed with a capital
--     first, a small letter before the inner capital and two after it
--     (MacDonald, DeShawn) — which is how somebody types their own name
--     and not how anybody types carelessly: JOHN, jOhN and JoHn are all
--     John. Initials stay capitals on the same reasoning: a word of one or
--     two letters typed in capitals, in a name with a small letter
--     somewhere (Ps Emmanuel KB, KK Renjith). A name typed all in capitals
--     says nothing about which words are initials, so JO SMITH is Jo
--     Smith; initials can always be given with full stops (K.B.).
--   person_name_ok(text)    whether a tidied name is one: it starts with a
--     letter and is letters — of any alphabet — with spaces, hyphens,
--     apostrophes and full stops between them. No digits, no @, no
--     underscore, no brackets.
--   person_name_salvage(text)  for the one place that must not refuse:
--     what is left of a name when everything that is not part of one is
--     taken out (possibly nothing).
--
-- Letters are judged by "pg_c_utf8", the collation Postgres 17 carries
-- inside itself, named outright in each function: what counts as a letter
-- and what its capital is must not turn on how a particular database was
-- created (the local CI database is "C", where é is not a letter at all).
--
-- **Which names.** A person's own, wherever it is kept:
--   profiles                    first_name, last_name, emergency_contact_name
--   household_members           first_name, last_name
--   guests                      name
--   registration_orders         name
--   registration_order_tickets  attendee_name
--   registration_messages       name
-- Not the name on a bank account (refund details, giving): that is what
-- the bank calls the account — "MR J SMITH", a business — and has to
-- match the bank, not the rota.
--
-- **Only a name that is being changed is judged.** An update that leaves a
-- name as it was does not look at it, so a registration whose name was
-- taken before there was a rule (one has brackets in it) can still be
-- paid, checked in and refunded. A blank is not judged either: whether a
-- name is needed is each table's own rule, as it was.
--
-- **Signing up is never refused for a name.** The profile is made by a
-- trigger on the account, and a refusal there reaches the person as
-- "Database error saving new user" with no word about why. So
-- handle_new_user() salvages: what is not part of a name is taken out and
-- the rest kept, and the joining form asks for anything left blank. The
-- sign-up form itself refuses a bad name with the reason; this is for
-- whatever does not come through that form.
--
-- **The names already here are tidied once**, before the triggers exist,
-- so nothing is refused for what it already was. Only capitals and spaces
-- move; a name that would not pass today is tidied as far as it goes and
-- left.
--
-- **The app that is live when this is applied** sends names untidied and
-- unchecked, as it always has. They are tidied as they land, and a name
-- that is not one is refused in this file's own words, which that app
-- shows as they are (a plain `raise` passes through lib/humanError).

-- ---------------------------------------------------------------------------
-- The name as it is kept
-- ---------------------------------------------------------------------------
create or replace function public.person_name_tidy(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $function$
declare
  v text;
  c text;
  n integer;
  i integer;
  kept text := '';
  -- The word so far, in small letters: what decides the next letter's case.
  word text := '';
  capital_next boolean := false;
  -- Whether the word in hand was typed with a capital first: only then can
  -- a capital inside it have been meant.
  typed_proper boolean := false;
  meant boolean;
  -- A small letter anywhere says the capitals in it were chosen, not left on.
  some_small boolean;
  -- Whether the word in hand is initials, kept as capitals.
  initials boolean := false;
  j integer;
  w text;
  before text;
  after1 text;
  after2 text;
begin
  if p is null then
    return null;
  end if;

  v := normalize(p, NFC);
  -- Five apostrophes to the plain one, five dashes to the hyphen, four
  -- kinds of space to a space.
  v := translate(v,
    U&'\2019\2018\02BC\0060\00B4\2010\2011\2012\2013\2014\00A0\0009\000A\000D',
    '''''''''''-----    ');
  v := regexp_replace(v, ' +', ' ', 'g');
  v := regexp_replace(v, ' ?- ?', '-', 'g');
  v := regexp_replace(v, '([-''.])\1+', '\1', 'g');
  v := regexp_replace(v, '^[-''. ]+', '');
  v := regexp_replace(v, '[-'' ]+$', '');

  n := char_length(v);
  some_small := v <> upper(v collate "pg_c_utf8");
  for i in 1 .. n loop
    c := substr(v, i, 1);
    if c = '''' then
      initials := false;
      capital_next := char_length(word) = 1;
      word := word || c;
      kept := kept || c;
    elsif ascii(c) < 128 and c !~ '[A-Za-z]' then
      word := '';
      capital_next := false;
      kept := kept || c;
    else
      if word = '' then
        typed_proper := c <> lower(c collate "pg_c_utf8");
        -- The word from here to whatever ends it. An apostrophe ends the
        -- look but not the word: O'B is not initials.
        j := i;
        while j <= n and substr(v, j, 1) <> '''' and not (ascii(substr(v, j, 1)) < 128 and substr(v, j, 1) !~ '[A-Za-z]') loop
          j := j + 1;
        end loop;
        w := substr(v, i, j - i);
        initials := some_small
          and j - i <= 2
          and substr(v, j, 1) <> ''''
          and not exists (
            select 1 from regexp_split_to_table(w, '') as letter
            where letter = lower(letter collate "pg_c_utf8"));
      end if;
      before := case when i > 1 then substr(v, i - 1, 1) else '' end;
      after1 := substr(v, i + 1, 1);
      after2 := substr(v, i + 2, 1);
      meant := typed_proper
        and char_length(word) >= 2
        and c <> lower(c collate "pg_c_utf8")
        and before <> '' and before <> upper(before collate "pg_c_utf8")
        and after1 <> '' and after1 <> upper(after1 collate "pg_c_utf8")
        and after2 <> '' and after2 <> upper(after2 collate "pg_c_utf8");
      if word = '' or capital_next or word = 'mc' or meant or initials then
        kept := kept || upper(c collate "pg_c_utf8");
      else
        kept := kept || lower(c collate "pg_c_utf8");
      end if;
      word := word || lower(c collate "pg_c_utf8");
      capital_next := false;
    end if;
  end loop;

  return kept;
end;
$function$;

comment on function public.person_name_tidy(text) is
  'A person''s name as it is kept: trimmed, squeezed and capitalised (0306). The same rule as lib/personName.ts tidyName; both are held to one list of examples.';

-- ---------------------------------------------------------------------------
-- Whether a tidied name is a name
-- ---------------------------------------------------------------------------
-- Said by what may not be in it rather than by what may: Postgres cannot
-- name "a letter or a mark that sits on one" in a pattern, and a list of
-- what is allowed would turn away the accents of names written in other
-- alphabets. So: it starts with a letter, and with the four things that
-- may stand between letters taken out, nothing is left that is a digit,
-- a symbol, a space or a control character. The app's rule is the
-- narrower of the two (letters and marks only), so nothing the form lets
-- through is refused here.
create or replace function public.person_name_ok(p text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $function$
  select p is not null
     and (p collate "pg_c_utf8") ~ '^[[:alpha:]]'
     and (translate(p, ' -''.', '') collate "pg_c_utf8") !~ '[[:digit:][:punct:][:cntrl:][:space:]$+<=>^`|~]';
$function$;

comment on function public.person_name_ok(text) is
  'Whether a name already tidied by person_name_tidy() is one: starts with a letter; letters with spaces, hyphens, apostrophes and full stops between them (0306).';

-- ---------------------------------------------------------------------------
-- What is left of a name, for the one place that must not refuse
-- ---------------------------------------------------------------------------
create or replace function public.person_name_salvage(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $function$
declare
  v text := public.person_name_tidy(p);
  c text;
  i integer;
  kept text := '';
begin
  if v is null or v = '' or public.person_name_ok(v) then
    return coalesce(v, '');
  end if;
  for i in 1 .. char_length(v) loop
    c := substr(v, i, 1);
    if c in (' ', '-', '''', '.')
       or (c collate "pg_c_utf8") !~ '[[:digit:][:punct:][:cntrl:][:space:]$+<=>^`|~]' then
      kept := kept || c;
    end if;
  end loop;
  v := public.person_name_tidy(kept);
  if v = '' or not public.person_name_ok(v) then
    return '';
  end if;
  return v;
end;
$function$;

comment on function public.person_name_salvage(text) is
  'A name with everything that is not part of one taken out, tidied; empty when nothing is left. For handle_new_user(), which must not refuse a sign-up (0306).';

revoke all on function public.person_name_tidy(text) from public;
revoke all on function public.person_name_ok(text) from public;
revoke all on function public.person_name_salvage(text) from public;
grant execute on function public.person_name_tidy(text) to anon, authenticated, service_role;
grant execute on function public.person_name_ok(text) to anon, authenticated, service_role;
grant execute on function public.person_name_salvage(text) to service_role;

-- ---------------------------------------------------------------------------
-- The two halves agree
-- ---------------------------------------------------------------------------
-- The same pairs as NAME_EXAMPLES in lib/personName.ts — typed, and what is
-- kept (null: refused) — which personName.test.ts reads out of this file
-- and holds to its own list. Run here, so a database where the rule does
-- not come out the same never gets the triggers.
do $examples$
declare
  r record;
  tidy text;
  wrong text := '';
begin
  for r in
    select * from (values
-- NAME_EXAMPLES begin
    ('john', 'John'),
    ('JOHN SMITH', 'John Smith'),
    ('jOhN sMiTh', 'John Smith'),
    ('  john   smith  ', 'John Smith'),
    ('anne-marie', 'Anne-Marie'),
    ('anne - marie', 'Anne-Marie'),
    ('ANNE–MARIE', 'Anne-Marie'),
    ('o''brien', 'O''Brien'),
    ('o’brien', 'O''Brien'),
    ('d''souza', 'D''Souza'),
    ('sa''id', 'Sa''id'),
    ('SHA''QUILLE', 'Sha''quille'),
    ('mcdonald', 'McDonald'),
    ('MCCARTHY', 'McCarthy'),
    ('mc', 'Mc'),
    ('mackenzie', 'Mackenzie'),
    ('MacDonald', 'MacDonald'),
    ('MACDONALD', 'Macdonald'),
    ('macdonald', 'Macdonald'),
    ('DeShawn', 'DeShawn'),
    ('LeAnn', 'LeAnn'),
    ('McDONALD', 'McDonald'),
    ('JoHn', 'John'),
    ('JoHnNy', 'Johnny'),
    ('JOhn', 'John'),
    ('van der berg', 'Van Der Berg'),
    ('st. john', 'St. John'),
    ('j.r. smith', 'J.R. Smith'),
    ('smith jr.', 'Smith Jr.'),
    ('élodie', 'Élodie'),
    ('ÉLODIE DUPONT', 'Élodie Dupont'),
    ('ñuñez', 'Ñuñez'),
    ('oluwaseun adéyemí', 'Oluwaseun Adéyemí'),
    ('-john-', 'John'),
    ('''''john', 'John'),
    ('john--paul', 'John-Paul'),
    ('McDonald', 'McDonald'),
    ('O''Brien-O''Neil', 'O''Brien-O''Neil'),
    ('John Smith', 'John Smith'),
    ('Ps Emmanuel KB', 'Ps Emmanuel KB'),
    ('Ps KK Renjith', 'Ps KK Renjith'),
    ('jerry KJ', 'Jerry KJ'),
    ('JOEL V REJI', 'Joel V Reji'),
    ('M kurian', 'M Kurian'),
    ('JO SMITH', 'Jo Smith'),
    ('MR JOHN SMITH', 'Mr John Smith'),
    ('YL', 'Yl'),
    ('kb', 'Kb'),
    ('k.b. ganesh', 'K.B. Ganesh'),
    ('John RAJ', 'John Raj'),
    ('y@cht_234', null),
    ('john2', null),
    ('john_smith', null),
    ('john@example.com', null),
    ('john (johnny)', null),
    ('mum & dad', null),
    ('smith, john', null),
    ('123', null),
    ('john 🙂', null),
    ('...', null)
-- NAME_EXAMPLES end
    ) as t(typed, kept)
  loop
    tidy := public.person_name_tidy(r.typed);
    if r.kept is null then
      if public.person_name_ok(tidy) then
        wrong := wrong || format(E'\n  "%s" was let through as "%s"', r.typed, tidy);
      end if;
    elsif tidy is distinct from r.kept or not public.person_name_ok(tidy) then
      wrong := wrong || format(E'\n  "%s" should be kept as "%s", came out "%s" (%s)', r.typed, r.kept, tidy,
        case when public.person_name_ok(tidy) then 'a name' else 'refused' end);
    elsif public.person_name_tidy(tidy) is distinct from tidy then
      wrong := wrong || format(E'\n  "%s" does not stay put: tidied again it is "%s"', tidy, public.person_name_tidy(tidy));
    end if;
  end loop;
  if wrong <> '' then
    raise exception 'person_name_tidy() does not match lib/personName.ts:%', wrong;
  end if;
end
$examples$;

-- ---------------------------------------------------------------------------
-- The names already here, once, before anything can refuse them
-- ---------------------------------------------------------------------------
update public.profiles
   set first_name = public.person_name_tidy(first_name)
 where btrim(first_name) <> '' and first_name is distinct from public.person_name_tidy(first_name);

update public.profiles
   set last_name = public.person_name_tidy(last_name)
 where btrim(last_name) <> '' and last_name is distinct from public.person_name_tidy(last_name);

update public.profiles
   set emergency_contact_name = public.person_name_tidy(emergency_contact_name)
 where btrim(emergency_contact_name) <> ''
   and emergency_contact_name is distinct from public.person_name_tidy(emergency_contact_name);

update public.household_members
   set first_name = public.person_name_tidy(first_name)
 where btrim(first_name) <> '' and first_name is distinct from public.person_name_tidy(first_name);

update public.household_members
   set last_name = public.person_name_tidy(last_name)
 where btrim(last_name) <> '' and last_name is distinct from public.person_name_tidy(last_name);

update public.guests
   set name = public.person_name_tidy(name)
 where name is distinct from public.person_name_tidy(name) and public.person_name_tidy(name) <> '';

update public.registration_orders
   set name = public.person_name_tidy(name)
 where name is distinct from public.person_name_tidy(name) and public.person_name_tidy(name) <> '';

update public.registration_order_tickets
   set attendee_name = public.person_name_tidy(attendee_name)
 where btrim(attendee_name) <> '' and attendee_name is distinct from public.person_name_tidy(attendee_name);

update public.registration_messages
   set name = public.person_name_tidy(name)
 where name is distinct from public.person_name_tidy(name) and public.person_name_tidy(name) <> '';

-- ---------------------------------------------------------------------------
-- Every name that arrives
-- ---------------------------------------------------------------------------
-- One function for every table: the columns that hold a name are the
-- trigger's arguments. A column not in the row is a mistake in the
-- `create trigger`, and says so.
create or replace function public.person_names_are_names()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  col text;
  said text;
  tidy text;
  arriving jsonb := to_jsonb(new);
  standing jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  foreach col in array tg_argv loop
    if not arriving ? col then
      raise exception 'person_names_are_names: %.% is not a column', tg_table_name, col;
    end if;
    said := arriving ->> col;
    -- A blank is each table's own business, and a name nobody is changing
    -- is not judged again.
    continue when said is null or btrim(said) = '';
    continue when tg_op = 'UPDATE' and said is not distinct from (standing ->> col);

    tidy := public.person_name_tidy(said);
    if tidy = '' or not public.person_name_ok(tidy) then
      raise exception
        '"%" is not a name the app can keep. A name is letters, with a space, a hyphen, an apostrophe or a full stop between them: no numbers and no symbols.',
        left(said, 60);
    end if;
    if tidy is distinct from said then
      new := jsonb_populate_record(new, jsonb_build_object(col, tidy));
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.person_names_are_names() from public, anon, authenticated;

drop trigger if exists profiles_names_are_names on public.profiles;
create trigger profiles_names_are_names
  before insert or update of first_name, last_name, emergency_contact_name on public.profiles
  for each row execute function public.person_names_are_names('first_name', 'last_name', 'emergency_contact_name');

drop trigger if exists household_members_names_are_names on public.household_members;
create trigger household_members_names_are_names
  before insert or update of first_name, last_name on public.household_members
  for each row execute function public.person_names_are_names('first_name', 'last_name');

drop trigger if exists guests_names_are_names on public.guests;
create trigger guests_names_are_names
  before insert or update of name on public.guests
  for each row execute function public.person_names_are_names('name');

drop trigger if exists registration_orders_names_are_names on public.registration_orders;
create trigger registration_orders_names_are_names
  before insert or update of name on public.registration_orders
  for each row execute function public.person_names_are_names('name');

drop trigger if exists registration_order_tickets_names_are_names on public.registration_order_tickets;
create trigger registration_order_tickets_names_are_names
  before insert or update of attendee_name on public.registration_order_tickets
  for each row execute function public.person_names_are_names('attendee_name');

drop trigger if exists registration_messages_names_are_names on public.registration_messages;
create trigger registration_messages_names_are_names
  before insert or update of name on public.registration_messages
  for each row execute function public.person_names_are_names('name');

-- ---------------------------------------------------------------------------
-- Signing up is never refused for a name
-- ---------------------------------------------------------------------------
-- As 0170 left it — no control characters, eighty at most — with the name
-- salvaged first, so the trigger above has nothing to refuse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    left(public.person_name_salvage(regexp_replace(coalesce(new.raw_user_meta_data ->> 'first_name', ''), '[[:cntrl:]]', '', 'g')), 80),
    left(public.person_name_salvage(regexp_replace(coalesce(new.raw_user_meta_data ->> 'last_name', ''), '[[:cntrl:]]', '', 'g')), 80),
    new.email
  );
  insert into public.profile_sensitive (user_id) values (new.id);
  return new;
end;
$$;
select public.migration_done(306, '0306_a_name_is_written_like_a_name', '03dfd71c80e8b1ce536d4f41a57fc8508ca10d4c77ad82fd08bd595ca710fa1f');
