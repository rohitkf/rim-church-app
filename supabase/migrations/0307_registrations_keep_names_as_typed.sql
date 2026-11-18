-- Registrations keep a name as it was typed, and initials alone stay capitals.
--
-- 0306 made a name be written like a name wherever one is kept. Two things
-- about it were wrong, and the Owner said so the same day (November 2026).
--
-- **Registrations and Reception were not what was asked for.** The ask was
-- about the people of the church — the rota, the teams, the profile — and
-- 0306 also put its trigger on a visitor's registration, the names on
-- their tickets and their message to the organisers, and tidied eight of
-- those names. A visitor's name on a registration is theirs as they gave
-- it: it is what is on the ticket they were sent and what they will say at
-- the door. So the three triggers come off, and nothing here judges or
-- changes a registration's name again. The eight names are put back by
-- hand, outside this file — a migration is in the repository for good and
-- people's names are not.
--
-- The rule stays where it was meant to be: profiles (first name, last
-- name, emergency contact), household_members and guests.
--
-- **Initials with nothing beside them stay capitals.** 0306 kept one or
-- two capital letters as initials only in a name with a small letter
-- somewhere (Ps Emmanuel KB), so that JO SMITH typed with the capitals
-- left on is Jo Smith. But a last name is its own box, and a last name of
-- "YL" has no small letter to be told by: it came out "Yl", and its owner
-- could never have had it back without full stops. One or two capitals
-- that are the whole name are initials. Somebody called Li who types LI
-- gets LI — and types Li to put it right, which is a thing they can do;
-- the other way round there was nothing to do.
--
-- The app's half is lib/personName.ts, and the list of examples below is
-- its NAME_EXAMPLES: personName.test.ts reads the newest migration that
-- carries the list and holds it to its own.
--
-- **The app that is live when this is applied** checks names on the
-- register page, the door and the organisers' message before sending
-- them; with the triggers gone it still does, until the release that
-- takes those checks out. Nothing it asks for goes away.

-- ---------------------------------------------------------------------------
-- A registration's names are the visitor's own
-- ---------------------------------------------------------------------------
drop trigger if exists registration_orders_names_are_names on public.registration_orders;
drop trigger if exists registration_order_tickets_names_are_names on public.registration_order_tickets;
drop trigger if exists registration_messages_names_are_names on public.registration_messages;

-- ---------------------------------------------------------------------------
-- The name as it is kept: as 0306, with initials that stand alone
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
        -- Chosen, or all there is: one or two capitals with nothing beside them.
        initials := (some_small or (i = 1 and j = n + 1))
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

-- ---------------------------------------------------------------------------
-- The two halves agree
-- ---------------------------------------------------------------------------
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
    ('YL', 'YL'),
    ('yl', 'Yl'),
    ('Li', 'Li'),
    ('V', 'V'),
    ('RAJ', 'Raj'),
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
select public.migration_done(307, '0307_registrations_keep_names_as_typed', '91cb55cc8023bfc3b085991edbecc4d581ce8bcb7c0e37feef4a4444f8d8c482');
