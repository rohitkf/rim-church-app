-- A husband is not a wife.
--
-- 0302 asked who the person to ring is, from a short list that put two
-- people in one word: "Husband or wife", "Brother or sister", "Son or
-- daughter", and "Parent" for a mother and a father alike. The Owner
-- reported that it confuses people (November 2026) — somebody choosing
-- from a list is looking for the one word that is theirs, and none of
-- those is — and whoever is ringing wants to know whether they are about
-- to speak to a mother or a father.
--
-- So each is its own answer: husband, wife, father, mother, son, daughter,
-- brother, sister. Partner, other relative, friend and other stay as they
-- were.
--
-- **The four combined answers stay valid, and are no longer offered.** The
-- app that is live when this is applied still offers them, and an answer
-- given is not thrown away to make a list tidier: `spouse`, `parent`,
-- `child` and `sibling` are kept by the column, read as the words they were
-- chosen as, and can be changed for a closer one on the profile. Nobody is
-- sent back to the form for it — the question has an answer.
--
-- The offered list is lib/joining.ts's `EMERGENCY_RELATIONS` and the kept
-- one its `EMERGENCY_RELATIONS_BEFORE`; joining.test.ts reads this file and
-- fails if the column's list is not the two together.

alter table public.profiles
  drop constraint if exists profiles_emergency_contact_relation_known,
  add constraint profiles_emergency_contact_relation_known
    check (emergency_contact_relation is null
      or emergency_contact_relation in (
        'husband', 'wife', 'partner', 'father', 'mother', 'son', 'daughter', 'brother', 'sister', 'relative', 'friend', 'other',
        'spouse', 'parent', 'child', 'sibling'
      ));

comment on column public.profiles.emergency_contact_relation is
  'What the person to ring is to them: one of lib/joining.ts EMERGENCY_RELATIONS, or one of the four it offered before 0305. Closed like phone (0127).';
select public.migration_done(305, '0305_a_husband_is_not_a_wife', '4e001c59bc5f6f5d93a58135b8b57c693de490411ceff66ef491cdef3a538c3b');
